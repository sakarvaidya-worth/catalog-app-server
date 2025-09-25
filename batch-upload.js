const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000';
const UPLOAD_ENDPOINT = `${API_BASE_URL}/api/upload`;

function parseFilename(filename) {
  const name = path.parse(filename).name;

  // Split by hyphen to get article IDs
  const articleIds = name.split('-')
    .map(id => id.trim())
    .filter(id => id !== '');

  return {
    filename: filename,
    articleIds: articleIds,
    isMultiple: articleIds.length > 1
  };
}

function getImageFiles(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    return files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.gif'].includes(ext);
      })
      .map(file => {
        const fullPath = path.join(folderPath, file);
        const parsed = parseFilename(file);

        return {
          filePath: fullPath,
          fileName: file,
          articleIds: parsed.articleIds,
          isMultiple: parsed.isMultiple
        };
      });
  } catch (error) {
    console.error('Error reading folder:', error.message);
    return [];
  }
}

async function uploadImage(imageInfo) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(imageInfo.filePath));

    // Use articleIds for multiple articles, articleId for single article
    if (imageInfo.isMultiple) {
      form.append('articleIds', imageInfo.articleIds.join(','));
    } else {
      form.append('articleId', imageInfo.articleIds[0]);
    }

    const response = await axios.post(UPLOAD_ENDPOINT, form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 30000
    });

    return {
      success: true,
      fileName: imageInfo.fileName,
      articleIds: imageInfo.articleIds,
      isMultiple: imageInfo.isMultiple,
      data: response.data
    };

  } catch (error) {
    return {
      success: false,
      fileName: imageInfo.fileName,
      articleIds: imageInfo.articleIds,
      isMultiple: imageInfo.isMultiple,
      error: error.response?.data?.error || error.message
    };
  }
}

async function batchUpload(folderPath, concurrent = 3) {
  console.log(`🚀 Starting batch upload from: ${folderPath}`);
  console.log(`📡 API Endpoint: ${UPLOAD_ENDPOINT}`);
  console.log(`🔄 Concurrent uploads: ${concurrent}\n`);

  const imageFiles = getImageFiles(folderPath);

  if (imageFiles.length === 0) {
    console.log('❌ No image files found in the specified folder.');
    return;
  }

  console.log(`📁 Found ${imageFiles.length} image files:\n`);

  imageFiles.forEach((img, index) => {
    if (img.isMultiple) {
      console.log(`   ${index + 1}. ${img.fileName}`);
      console.log(`      → Article IDs: ${img.articleIds.join(', ')} (${img.articleIds.length} articles)`);
    } else {
      console.log(`   ${index + 1}. ${img.fileName} → Article ID: ${img.articleIds[0]}`);
    }
  });
  console.log();

  const results = {
    successful: [],
    failed: []
  };

  // Process files in batches
  for (let i = 0; i < imageFiles.length; i += concurrent) {
    const batch = imageFiles.slice(i, i + concurrent);
    console.log(`📤 Processing batch ${Math.floor(i / concurrent) + 1}/${Math.ceil(imageFiles.length / concurrent)}...`);

    const promises = batch.map(async (imageInfo, batchIndex) => {
      const overallIndex = i + batchIndex + 1;
      const articleText = imageInfo.isMultiple
        ? `${imageInfo.articleIds.length} articles (${imageInfo.articleIds.join(', ')})`
        : `1 article (${imageInfo.articleIds[0]})`;

      console.log(`   [${overallIndex}/${imageFiles.length}] Uploading ${imageInfo.fileName} for ${articleText}...`);

      const result = await uploadImage(imageInfo);

      if (result.success) {
        console.log(`   ✅ [${overallIndex}/${imageFiles.length}] ${imageInfo.fileName} uploaded successfully`);
        console.log(`      UUID: ${result.data.uuid}`);
        if (result.data.articleCount) {
          console.log(`      Created ${result.data.articleCount} database records`);
        }
        results.successful.push(result);
      } else {
        console.log(`   ❌ [${overallIndex}/${imageFiles.length}] ${imageInfo.fileName} failed: ${result.error}`);
        results.failed.push(result);
      }

      return result;
    });

    await Promise.all(promises);
    console.log();
  }

  // Summary
  console.log('📊 Upload Summary:');
  console.log(`   ✅ Successful: ${results.successful.length}`);
  console.log(`   ❌ Failed: ${results.failed.length}`);
  console.log(`   📈 Success Rate: ${((results.successful.length / imageFiles.length) * 100).toFixed(1)}%`);

  // Count total article-image relationships created
  const totalRelationships = results.successful.reduce((total, result) => {
    return total + (result.data.articleCount || result.articleIds.length);
  }, 0);

  console.log(`   🔗 Total article-image relationships created: ${totalRelationships}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed uploads:');
    results.failed.forEach(fail => {
      const articleText = fail.isMultiple
        ? `${fail.articleIds.join(', ')}`
        : fail.articleIds[0];
      console.log(`   - ${fail.fileName} (${articleText}): ${fail.error}`);
    });
  }

  console.log('\n🎉 Batch upload completed!');
}

function showUsage() {
  console.log('📋 Usage:');
  console.log('   node batch-upload.js <folder-path> [concurrent-uploads]');
  console.log('');
  console.log('📁 Examples:');
  console.log('   node batch-upload.js ./images');
  console.log('   node batch-upload.js ./images 5');
  console.log('   node batch-upload.js "C:\\Users\\Name\\Pictures"');
  console.log('');
  console.log('📝 File Naming Convention:');
  console.log('   Single article:   "article123.png" → Article ID: article123');
  console.log('   Multiple articles: "art1-art2-art3.jpg" → Article IDs: art1, art2, art3');
  console.log('');
  console.log('✨ Features:');
  console.log('   - Supports PNG, JPG, JPEG, GIF formats');
  console.log('   - Handles both single and multiple article assignments');
  console.log('   - Creates separate database records for each article-image relationship');
  console.log('   - Default concurrent uploads: 3');
  console.log('   - Make sure the API server is running on http://localhost:5000');
}

// Main execution
if (process.argv.length < 3) {
  showUsage();
  process.exit(1);
}

const folderPath = process.argv[2];
const concurrent = parseInt(process.argv[3]) || 3;

if (!fs.existsSync(folderPath)) {
  console.error(`❌ Error: Folder "${folderPath}" does not exist.`);
  process.exit(1);
}

if (!fs.statSync(folderPath).isDirectory()) {
  console.error(`❌ Error: "${folderPath}" is not a directory.`);
  process.exit(1);
}

batchUpload(folderPath, concurrent).catch(error => {
  console.error('💥 Batch upload failed:', error.message);
  process.exit(1);
});