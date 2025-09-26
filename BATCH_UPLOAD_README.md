# Batch Image Upload Tool

A Node.js script to batch upload images to your Firebase-S3 server based on SAP IDs in filenames.

## Features

- **SAP ID Parsing**: Automatically extracts SAP IDs from image filenames
- **Multiple SAPs**: Supports single or multiple SAP IDs per image (e.g., `123456.png` or `123456-789012-345678.png`)
- **Concurrent Uploads**: Configurable concurrent upload limit to optimize performance
- **Error Handling**: Comprehensive error handling with detailed logging
- **Progress Tracking**: Real-time upload progress with colored console output
- **Flexible Options**: Command-line options for customization

## Installation

The required dependencies are already installed:
```bash
npm install form-data node-fetch
```

## Usage

### Basic Usage
```bash
node batch-upload.js ./images
```

### Advanced Usage
```bash
# Upload from specific folder with 5 concurrent uploads
node batch-upload.js /path/to/images --concurrent 5

# Quiet mode (minimal output)
node batch-upload.js ./images --quiet

# Continue on errors
node batch-upload.js ./images --skip-errors

# Custom server URL
node batch-upload.js ./images --server http://192.168.1.100:5000
```

## Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--concurrent` | `-c` | Number of concurrent uploads | 3 |
| `--verbose` | `-v` | Enable verbose output | true |
| `--quiet` | `-q` | Disable verbose output | false |
| `--skip-errors` | | Continue processing even if uploads fail | false |
| `--server` | | Override server URL | http://localhost:5000 |
| `--help` | `-h` | Show help message | |

## Image Naming Convention

Images must be named with SAP IDs (numbers only):

### Single SAP ID
```
9836289.png
1234567.jpg
5678901.jpeg
```

### Multiple SAP IDs (separated by dashes)
```
9836289-1234567.png
123456-789012-345678.jpg
111111-222222-333333-444444.webp
```

### Supported Image Formats
- JPG/JPEG
- PNG
- GIF
- WebP
- BMP
- TIFF/TIF

## Example Folder Structure
```
images/
├── 9836289.png                    # Single SAP
├── 1234567-9876543.jpg           # Multiple SAPs
├── 5555555-6666666-7777777.png   # Multiple SAPs
├── invalid-name.png              # Will be skipped
└── 8888888.gif                   # Single SAP
```

## Output Examples

### Successful Upload
```
✓ SAP 9836289: Upload successful (Image ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
```

### Failed Upload
```
✗ SAP 1234567: Product not found with given SAP
```

### Skipped File
```
⚠ Skipping invalid-name.png - no SAP IDs found in filename
```

### Summary Report
```
=== Upload Summary ===
Total uploads attempted: 15
Successful: 12
Failed: 3
Skipped files: 1

Errors encountered:
  missing-product.png (SAP 9999999): Product not found with given SAP
  bad-image.jpg (SAP 1111111): Internal server error
```

## Server Requirements

- The server must be running on the specified URL (default: http://localhost:5000)
- The `/upload-image/:sap` endpoint must be available
- Products with the specified SAP IDs must exist in the Firebase database

## Error Handling

The script handles various error scenarios:

1. **Missing Products**: When a SAP ID doesn't exist in the database
2. **Network Errors**: Connection issues with the server
3. **Invalid Files**: Non-image files or corrupted images
4. **Server Errors**: Internal server errors during upload

## Performance Tips

1. **Concurrent Uploads**: Increase `--concurrent` value for faster uploads (be mindful of server capacity)
2. **Network**: Ensure stable network connection for large batches
3. **File Size**: Optimize image file sizes before batch upload
4. **Server Resources**: Monitor server resources during large batch operations

## Troubleshooting

### Common Issues

1. **"No SAP IDs found in filename"**
   - Ensure filenames contain only numeric SAP IDs
   - Use dashes to separate multiple SAP IDs
   - Remove any non-numeric characters from filenames

2. **"Product not found with given SAP"**
   - Verify the SAP ID exists in your Firebase products collection
   - Check that the SAP field in Firebase contains numeric values

3. **"Connection refused"**
   - Ensure your server is running on the specified port
   - Check firewall settings if using remote server

4. **"File too large"**
   - Server has a 10MB file size limit
   - Compress images if they exceed this limit

## Example Script Usage

```bash
# Start your server first
npm start

# In another terminal, run batch upload
node batch-upload.js ./product-images --concurrent 3 --verbose
```

This will process all images in the `./product-images` folder and upload them to your server with detailed progress output.