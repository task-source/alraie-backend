import fs from 'fs';
import { S3 } from 'aws-sdk';
import { Client } from 'minio';
import { logger } from '../utils/logger';

const storageDriver = process.env.STORAGE_DRIVER || 'minio';

export class FileService {
  private s3: S3 | undefined;
  private minio: Client | undefined;

  constructor() {
    if (storageDriver === 's3') {
      this.s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      });
    } else {
      this.minio = new Client({
        endPoint: process.env.MINIO_ENDPOINT!,
        port: Number(process.env.MINIO_PORT) || 9000,
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY!,
        secretKey: process.env.MINIO_SECRET_KEY!,
      });
    }
  }

  async uploadFile(filePath: string, fileName: string, mimeType: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileStream = fs.createReadStream(filePath);
      const fileStat = fs.statSync(filePath);

      if (storageDriver === 's3') {
        const bucket = process.env.AWS_BUCKET_NAME!;
        await this.s3!.upload({
          Bucket: bucket,
          Key: fileName,
          Body: fileStream,
          ContentType: mimeType,
        }).promise();

        logger.info(`✅ Uploaded file to S3: ${fileName}`);
        fs.unlinkSync(filePath); //delete from temp
        return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
      } else {
        const bucket = process.env.MINIO_BUCKET!;
        const exists = await this.minio!.bucketExists(bucket).catch(() => false);
        if (!exists) {
          await this.minio!.makeBucket(bucket, 'us-east-1');
          logger.info(`📦 Created new MinIO bucket: ${bucket}`);
        }

        await this.minio!.putObject(bucket, fileName, fileStream, fileStat.size, {
          'Content-Type': mimeType,
        });

        logger.info(`✅ Uploaded file to MinIO: ${fileName}`);
        fs.unlinkSync(filePath); //delete from temp
        return `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${bucket}/${fileName}`;
      }
    } catch (error: any) {
      logger.error(`❌ File upload failed: ${error.message}`);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          logger.warn(`🧹 Temp file deleted after failure: ${filePath}`);
        } catch (unlinkErr: any) {
          logger.error(`Failed to delete temp file: ${unlinkErr.message}`);
        }
      }

      throw new Error('File upload failed. Please try again later.');
    }
  }
}
