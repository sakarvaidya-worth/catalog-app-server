# Firebase Server with S3 Integration

A Node.js Express server that integrates Firebase Firestore with AWS S3 for product image management.

## Features

- Upload images to S3 using product SAP codes
- Serve images via unique image IDs
- Update Firebase product documents with image references
- EC2 IAM role-based S3 access (no keys required)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Ensure your EC2 instance has an IAM role with S3 permissions for bucket `hetproductimages`

3. Set up Firebase Admin SDK credentials (Google Application Default Credentials)

4. Start the server:
```bash
npm start
```

The server will run on port 5000.

## API Endpoints

### Upload Image
**POST** `/upload-image/:sap`

Upload an image for a product using its SAP code.

- **Parameters**:
  - `sap` (path parameter): Product SAP code
- **Body**: Form-data with `image` file
- **Response**:
```json
{
  "message": "Image uploaded successfully",
  "imageId": "40c17fea-9b15-469e-8960-20d17c4e5bba",
  "sap": "12345"
}
```

### Serve Image
**GET** `/serve-image/:imageId`

Serve an image by its UUID.

- **Parameters**:
  - `imageId` (path parameter): Image UUID
- **Response**: Image file with appropriate Content-Type

### Get Product Image URL
**GET** `/product/:sap/image`

Get the image URL for a product by SAP code.

- **Parameters**:
  - `sap` (path parameter): Product SAP code
- **Response**:
```json
{
  "sap": "12345",
  "imageUrl": "http://your-server:5000/serve-image/40c17fea-9b15-469e-8960-20d17c4e5bba",
  "imageId": "40c17fea-9b15-469e-8960-20d17c4e5bba"
}
```

### Health Check
**GET** `/health`

Check server status.

## Firebase Product Document Structure

Products should have the following fields:
- `Category` (string) - Product category
- `Sub Category` (string) - Subcategory classification
- `Product` (string) - Product name
- `Description` (string) - Product description
- `HS Code` (number) - Harmonized System code
- `MRP` (number) - Maximum Retail Price
- `PU` (number) - Price Unit
- `Qty` (number) - Quantity
- `SAP` (number) - SAP identifier
- `Unit` (string) - Unit of measurement
- `imageid` (string) - Image UUID (added by upload endpoint)

## S3 Configuration

- Bucket: `hetproductimages`
- Region: `us-east-1`
- Access: EC2 IAM role (no access keys required)
- Images stored with UUID filenames

## Example Usage

```bash
# Upload image for product with SAP 12345
curl -X POST -F "image=@product.jpg" http://localhost:5000/upload-image/12345

# Get image URL for product
curl http://localhost:5000/product/12345/image

# Serve image directly
curl http://localhost:5000/serve-image/40c17fea-9b15-469e-8960-20d17c4e5bba
```