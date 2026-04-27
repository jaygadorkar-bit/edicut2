import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imagePath = 'D:\\Edicut\\media\\900x600_Skinmynt-Serum (1).webp';

async function uploadImage() {
  try {
    console.log(`Uploading ${imagePath} to Cloudinary...`);
    const result = await cloudinary.uploader.upload(imagePath, {
      public_id: 'hero_background',
      folder: 'edicut/hero',
      overwrite: true,
    });
    console.log('Upload successful!');
    console.log('URL:', result.secure_url);
    process.exit(0);
  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

uploadImage();
