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

    const { articleId } = req.body;
    if (!articleId) {
      return res.status(400).json({ error: 'Article ID is required' });
    }

    const imageUuid = uuidv4();
    const fileExtension = path.extname(req.file.originalname);
    const s3Key = `${imageUuid}${fileExtension}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'public-read'
    };

    const result = await s3.upload(uploadParams).promise();

    db.run(`INSERT OR IGNORE INTO articles (article_id) VALUES (?)`, [articleId]);

    db.run(
      `INSERT INTO images (uuid, article_id, original_name, s3_key, s3_url, content_type, size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [imageUuid, articleId, req.file.originalname, s3Key, result.Location, req.file.mimetype, req.file.size],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to save image metadata' });
        }

        res.json({
          message: 'File uploaded successfully',
          uuid: imageUuid,
          articleId: articleId,
          originalName: req.file.originalname,
          url: result.Location,
          s3Key: s3Key,
          contentType: req.file.mimetype,
          size: req.file.size
        });
      }
    );

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

        res.json({
          articleId: articleId,
          images: rows,
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

app.get('/', (req, res) => {
  res.json({
    message: 'S3 Upload API Server with SQLite',
    endpoints: {
      upload: 'POST /api/upload (requires: file, articleId)',
      getArticleImages: 'GET /api/article/:articleId/images',
      getImageByUuid: 'GET /api/image/:uuid',
      listArticles: 'GET /api/articles',
      deleteImage: 'DELETE /api/image/:uuid'
    },
    database: 'SQLite with article-image relationships',
    storage: 'AWS S3 (hetproductimages bucket)'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});