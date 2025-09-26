const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

const s3 = new AWS.S3({
  region: 'us-east-1'
});

const BUCKET_NAME = 'hetproductimages';

const db = new sqlite3.Database('articles_images.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,
    article_id TEXT,
    original_name TEXT,
    s3_key TEXT,
    s3_url TEXT,
    content_type TEXT,
    size INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles (article_id)
  )`);
});

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(express.json());

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { articleId, articleIds } = req.body;

    let articleIdList = [];
    if (articleIds) {
      // Handle multiple article IDs (comma-separated string or array)
      if (Array.isArray(articleIds)) {
        articleIdList = articleIds.filter(id => id && id.trim());
      } else if (typeof articleIds === 'string') {
        articleIdList = articleIds.split(',').map(id => id.trim()).filter(id => id);
      }
    } else if (articleId) {
      // Handle single article ID for backward compatibility
      articleIdList = [articleId.trim()];
    }

    if (articleIdList.length === 0) {
      return res.status(400).json({ error: 'At least one Article ID is required' });
    }

    const baseUuid = uuidv4();
    const fileExtension = path.extname(req.file.originalname);
    const s3Key = `${baseUuid}${fileExtension}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    };

    const result = await s3.upload(uploadParams).promise();

    // Insert articles (ignore if they already exist)
    const articlePromises = articleIdList.map(artId => {
      return new Promise((resolve, reject) => {
        db.run(`INSERT OR IGNORE INTO articles (article_id) VALUES (?)`, [artId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    await Promise.all(articlePromises);

    // Insert image records for each article
    const imagePromises = articleIdList.map(artId => {
      const imageUuid = uuidv4(); // Generate unique UUID for each article-image combination
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO images (uuid, article_id, original_name, s3_key, s3_url, content_type, size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [imageUuid, artId, req.file.originalname, s3Key, result.Location, req.file.mimetype, req.file.size],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({
                id: this.lastID,
                articleId: artId,
                uuid: imageUuid
              });
            }
          }
        );
      });
    });

    try {
      const insertResults = await Promise.all(imagePromises);

      res.json({
        message: 'File uploaded successfully',
        articleIds: articleIdList,
        articleCount: articleIdList.length,
        originalName: req.file.originalname,
        url: result.Location,
        s3Key: s3Key,
        contentType: req.file.mimetype,
        size: req.file.size,
        insertedRecords: insertResults
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      res.status(500).json({ error: 'Failed to save image metadata' });
    }

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.get('/api/article/:articleId/images', (req, res) => {
  try {
    const articleId = req.params.articleId;

    db.all(
      `SELECT uuid, original_name, s3_key, s3_url, content_type, size, created_at
       FROM images WHERE article_id = ? ORDER BY created_at DESC`,
      [articleId],
      (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch images' });
        }

        // Add server image URLs to the response
        const imagesWithServerUrls = rows.map(row => ({
          ...row,
          server_url: `${req.protocol}://${req.get('host')}/api/serve-image/${row.uuid}`
        }));

        res.json({
          articleId: articleId,
          images: imagesWithServerUrls,
          count: rows.length
        });
      }
    );

  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ error: 'Failed to get images' });
  }
});

app.get('/api/image/:uuid', (req, res) => {
  try {
    const uuid = req.params.uuid;

    db.get(
      `SELECT * FROM images WHERE uuid = ?`,
      [uuid],
      async (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch image' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Image not found' });
        }

        try {
          const url = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: row.s3_key,
            Expires: 3600
          });

          res.json({
            uuid: row.uuid,
            articleId: row.article_id,
            originalName: row.original_name,
            url: url,
            s3Key: row.s3_key,
            contentType: row.content_type,
            size: row.size,
            createdAt: row.created_at
          });
        } catch (s3Error) {
          console.error('S3 error:', s3Error);
          res.status(500).json({ error: 'Failed to generate signed URL' });
        }
      }
    );

  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ error: 'Failed to get image' });
  }
});

app.get('/api/articles', (req, res) => {
  try {
    db.all(
      `SELECT a.article_id, a.created_at,
              COUNT(i.id) as image_count,
              GROUP_CONCAT(i.uuid) as image_uuids
       FROM articles a
       LEFT JOIN images i ON a.article_id = i.article_id
       GROUP BY a.article_id, a.created_at
       ORDER BY a.created_at DESC`,
      (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch articles' });
        }

        const articles = rows.map(row => ({
          articleId: row.article_id,
          createdAt: row.created_at,
          imageCount: row.image_count,
          imageUuids: row.image_uuids ? row.image_uuids.split(',') : []
        }));

        res.json({
          articles: articles,
          count: articles.length
        });
      }
    );

  } catch (error) {
    console.error('Get articles error:', error);
    res.status(500).json({ error: 'Failed to get articles' });
  }
});

app.get('/api/serve-image/:uuid', (req, res) => {
  try {
    const uuid = req.params.uuid;

    db.get(
      `SELECT s3_key, content_type, original_name FROM images WHERE uuid = ?`,
      [uuid],
      async (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch image' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Image not found' });
        }

        try {
          const params = {
            Bucket: BUCKET_NAME,
            Key: row.s3_key
          };

          // Get the image data from S3
          const s3Object = await s3.getObject(params).promise();

          // Set appropriate headers
          res.set({
            'Content-Type': row.content_type,
            'Content-Length': s3Object.ContentLength,
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
            'Content-Disposition': `inline; filename="${row.original_name}"`
          });

          // Send the image data
          res.send(s3Object.Body);

        } catch (s3Error) {
          console.error('S3 error:', s3Error);
          res.status(500).json({ error: 'Failed to retrieve image from storage' });
        }
      }
    );

  } catch (error) {
    console.error('Serve image error:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

app.delete('/api/image/:uuid', (req, res) => {
  try {
    const uuid = req.params.uuid;

    db.get(
      `SELECT s3_key FROM images WHERE uuid = ?`,
      [uuid],
      async (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to find image' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Image not found' });
        }

        try {
          const params = {
            Bucket: BUCKET_NAME,
            Key: row.s3_key
          };

          await s3.deleteObject(params).promise();

          db.run(
            `DELETE FROM images WHERE uuid = ?`,
            [uuid],
            function(deleteErr) {
              if (deleteErr) {
                console.error('Database delete error:', deleteErr);
                return res.status(500).json({ error: 'Failed to delete image record' });
              }

              res.json({
                message: 'Image deleted successfully',
                uuid: uuid
              });
            }
          );

        } catch (s3Error) {
          console.error('S3 delete error:', s3Error);
          res.status(500).json({ error: 'Failed to delete file from S3' });
        }
      }
    );

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

app.get('/api/images', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Get total count
    db.get(
      `SELECT COUNT(*) as total FROM images`,
      (err, countRow) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to fetch image count' });
        }

        // Get paginated images with article info
        db.all(
          `SELECT
             i.uuid,
             i.article_id,
             i.original_name,
             i.s3_key,
             i.s3_url,
             i.content_type,
             i.size,
             i.created_at
           FROM images i
           ORDER BY i.created_at DESC
           LIMIT ? OFFSET ?`,
          [limit, offset],
          (err, rows) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to fetch images' });
            }

            const totalPages = Math.ceil(countRow.total / limit);

            // Add server image URLs to the response
            const imagesWithServerUrls = rows.map(row => ({
              ...row,
              server_url: `${req.protocol}://${req.get('host')}/api/serve-image/${row.uuid}`
            }));

            res.json({
              images: imagesWithServerUrls,
              pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalImages: countRow.total,
                imagesPerPage: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
              }
            });
          }
        );
      }
    );

  } catch (error) {
    console.error('Get all images error:', error);
    res.status(500).json({ error: 'Failed to get images' });
  }
});

app.delete('/api/images/all', async (req, res) => {
  try {
    // Get all images from database
    db.all(`SELECT s3_key FROM images`, async (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch images from database' });
      }

      if (rows.length === 0) {
        return res.json({ message: 'No images found to delete', deletedCount: 0 });
      }

      try {
        // Delete all objects from S3
        const deleteParams = {
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: rows.map(row => ({ Key: row.s3_key })),
            Quiet: false
          }
        };

        const deleteResult = await s3.deleteObjects(deleteParams).promise();

        // Clear all records from database
        db.serialize(() => {
          db.run(`DELETE FROM images`, (dbErr) => {
            if (dbErr) {
              console.error('Database delete error:', dbErr);
              return res.status(500).json({
                error: 'S3 cleanup successful but database cleanup failed',
                s3DeletedCount: deleteResult.Deleted?.length || 0,
                s3Errors: deleteResult.Errors || []
              });
            }

            db.run(`DELETE FROM articles WHERE article_id NOT IN (SELECT DISTINCT article_id FROM images)`, (cleanupErr) => {
              if (cleanupErr) {
                console.error('Articles cleanup error:', cleanupErr);
              }

              res.json({
                message: 'All images deleted successfully',
                s3DeletedCount: deleteResult.Deleted?.length || 0,
                s3Errors: deleteResult.Errors || [],
                databaseCleared: true,
                orphanedArticlesRemoved: true
              });
            });
          });
        });

      } catch (s3Error) {
        console.error('S3 delete error:', s3Error);
        res.status(500).json({
          error: 'Failed to delete images from S3',
          details: s3Error.message,
          foundImageCount: rows.length
        });
      }
    });

  } catch (error) {
    console.error('Delete all images error:', error);
    res.status(500).json({ error: 'Failed to delete all images' });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'S3 Upload API Server with SQLite',
    endpoints: {
      upload: 'POST /api/upload (requires: file, articleId OR articleIds)',
      getArticleImages: 'GET /api/article/:articleId/images (returns server_url for each image)',
      getImageByUuid: 'GET /api/image/:uuid (returns signed S3 URL)',
      serveImage: 'GET /api/serve-image/:uuid (serves image directly through server)',
      listArticles: 'GET /api/articles',
      listAllImages: 'GET /api/images?page=1&limit=50 (returns server_url for each image)',
      deleteImage: 'DELETE /api/image/:uuid',
      deleteAllImages: 'DELETE /api/images/all (DANGER: deletes all images from S3 and database)'
    },
    uploadOptions: {
      singleArticle: 'articleId: "article123"',
      multipleArticles: 'articleIds: "article1,article2,article3" or articleIds: ["article1", "article2", "article3"]'
    },
    database: 'SQLite with article-image relationships',
    storage: 'AWS S3 (hetproductimages bucket)'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});