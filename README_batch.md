# Batch Image Upload Script

This script uploads images from a folder to your S3 API server, supporting both single and multiple article ID assignments per image.

## Prerequisites

- API server running on `http://localhost:5000`
- Node.js installed
- Dependencies: `form-data`, `axios` (already installed)

## Usage

```bash
node batch-upload.js <folder-path> [concurrent-uploads]
```

### Examples

```bash
# Upload images from ./images folder with default concurrency (3)
node batch-upload.js ./images

# Upload with custom concurrency
node batch-upload.js ./images 5

# Upload from Windows path
node batch-upload.js "C:\Users\Name\Pictures"
```

## File Naming Convention

### Single Article Assignment
- `article123.png` → Article ID: `article123`
- `product-xyz.jpg` → Article ID: `product-xyz`
- `blog-post.jpeg` → Article ID: `blog-post`

### Multiple Article Assignment
- `art1-art2-art3.png` → Article IDs: `art1`, `art2`, `art3`
- `blog-news-feature.jpg` → Article IDs: `blog`, `news`, `feature`
- `prod1-prod2.gif` → Article IDs: `prod1`, `prod2`

## Features

- ✅ **Dual Format Support**: Handles both single (`articleid.png`) and multiple (`art1-art2-art3.png`) article assignments
- ✅ **Smart API Integration**: Uses `articleId` for single articles, `articleIds` for multiple articles
- ✅ **Database Relationships**: Creates separate records for each article-image relationship
- ✅ **Batch Processing**: Configurable concurrent uploads (default: 3)
- ✅ **Progress Tracking**: Real-time upload progress with detailed logging
- ✅ **Error Handling**: Individual upload error handling with summary
- ✅ **Format Support**: PNG, JPG, JPEG, GIF formats
- ✅ **Relationship Counting**: Shows total article-image relationships created

## Output Example

```
🚀 Starting batch upload from: ./images
📡 API Endpoint: http://localhost:5000/api/upload
🔄 Concurrent uploads: 3

📁 Found 3 image files:

   1. article123.png → Article ID: article123
   2. blog-news-feature.jpg
      → Article IDs: blog, news, feature (3 articles)
   3. product-xy.png → Article ID: product-xy

📤 Processing batch 1/1...
   [1/3] Uploading article123.png for 1 article (article123)...
   ✅ [1/3] article123.png uploaded successfully
      UUID: 550e8400-e29b-41d4-a716-446655440000

   [2/3] Uploading blog-news-feature.jpg for 3 articles (blog, news, feature)...
   ✅ [2/3] blog-news-feature.jpg uploaded successfully
      UUID: 550e8400-e29b-41d4-a716-446655440001
      Created 3 database records

📊 Upload Summary:
   ✅ Successful: 3
   ❌ Failed: 0
   📈 Success Rate: 100.0%
   🔗 Total article-image relationships created: 5

🎉 Batch upload completed!
```

## API Integration

The script automatically detects the filename format and uses the appropriate API parameter:

- **Single Article**: Uses `articleId` parameter
- **Multiple Articles**: Uses `articleIds` parameter (comma-separated string)

Each image gets a single UUID but creates multiple database records for multiple article assignments.