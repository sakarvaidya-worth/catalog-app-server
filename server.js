import express from 'express';
import cors from 'cors';
import multer from 'multer';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db, adminDb } from './config.js';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

AWS.config.update({
  region: 'us-east-1'
});

const s3 = new AWS.S3();
const BUCKET_NAME = 'hetproductimages';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.post('/upload-image/:sap?', upload.single('image'), async (req, res) => {
  try {
    const { sap } = req.params;
    const { saps } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Determine SAP IDs to process - either from params or body
    let sapIds = [];
    if (saps) {
      try {
        const parsedSaps = typeof saps === 'string' ? JSON.parse(saps) : saps;
        if (Array.isArray(parsedSaps)) {
          sapIds = parsedSaps.map(id => parseInt(id));
        }
      } catch (error) {
        return res.status(400).json({ error: 'Invalid SAPs format' });
      }
    } else if (sap) {
      sapIds = [parseInt(sap)];
    } else {
      return res.status(400).json({ error: 'No SAP ID(s) provided' });
    }

    // Generate single UUID for the image
    const imageId = uuidv4();
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${imageId}.${fileExtension}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'private'
    };

    // Upload image once to S3
    await s3.upload(uploadParams).promise();

    const productsRef = collection(db, 'products');
    const updateResults = [];
    const notFound = [];

    // Update all products with the same imageId
    for (const sapId of sapIds) {
      const q = query(productsRef, where('SAP', '==', sapId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        notFound.push(sapId);
      } else {
        const productDoc = querySnapshot.docs[0];
        const productRef = doc(db, 'products', productDoc.id);

        await updateDoc(productRef, {
          imageid: imageId
        });

        updateResults.push(sapId);
      }
    }

    res.status(200).json({
      message: 'Image uploaded successfully',
      imageId: imageId,
      updatedSaps: updateResults,
      notFoundSaps: notFound,
      totalRequested: sapIds.length,
      totalUpdated: updateResults.length
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/serve-image/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;

    const productsRef = collection(db, 'products');
    const q = query(productsRef, where('imageid', '==', imageId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: imageId
    };

    const objects = await s3.listObjectsV2(listParams).promise();

    if (!objects.Contents || objects.Contents.length === 0) {
      return res.status(404).json({ error: 'Image file not found in S3' });
    }

    const imageKey = objects.Contents[0].Key;

    const getParams = {
      Bucket: BUCKET_NAME,
      Key: imageKey
    };

    const imageObject = await s3.getObject(getParams).promise();

    const contentType = imageObject.ContentType || 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(imageObject.Body);

  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/product/:sap/image', async (req, res) => {
  try {
    const { sap } = req.params;

    const productsRef = collection(db, 'products');
    const q = query(productsRef, where('SAP', '==', parseInt(sap)));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return res.status(404).json({ error: 'Product not found with given SAP' });
    }

    const productData = querySnapshot.docs[0].data();

    if (!productData.imageid) {
      return res.status(404).json({ error: 'No image associated with this product' });
    }

    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${serverUrl}/serve-image/${productData.imageid}`;

    res.status(200).json({
      sap: sap,
      imageUrl: imageUrl,
      imageId: productData.imageid
    });

  } catch (error) {
    console.error('Error getting product image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Server is running', port: PORT });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});