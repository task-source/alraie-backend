import fs from 'fs';
import { S3 } from 'aws-sdk';
import { Client } from 'minio';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters, BlobSASPermissions
} from '@azure/storage-blob';
import { logger } from '../utils/logger';

const storageDriver = process.env.STORAGE_DRIVER || 'minio'; // 's3' | 'minio' | 'azure'

export class FileService {
  private s3: S3 | undefined;
  private minio: Client | undefined;
  private azureClient: BlobServiceClient | undefined;
  private azureCredential: StorageSharedKeyCredential | undefined;

  constructor() {
    if (storageDriver === 's3') {
      this.s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      });
    } else if (storageDriver === 'azure') {
      let connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        throw new Error('Missing Azure connection string');
      }

      if (connectionString.includes('DefaultEndpointsProtocol') === false) {
        try {
          const decoded = Buffer.from(connectionString, 'base64').toString('utf8');
          if (decoded.includes('DefaultEndpointsProtocol')) {
            connectionString = decoded;
          } else {
            throw new Error('Invalid decoded Azure connection string');
          }
        } catch (err: any) {
          logger.error(`❌ Failed to decode Azure connection string: ${err.message}`);
          throw new Error('Invalid Azure connection string format');
        }
      }

      if (
        !connectionString.includes('DefaultEndpointsProtocol=https') &&
        !connectionString.includes('DefaultEndpointsProtocol=http')
      ) {
        throw new Error(
          "Invalid DefaultEndpointsProtocol in Azure connection string. Expecting 'https' or 'http'."
        );
      }

      const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!;
      const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY!;

      this.azureCredential = new StorageSharedKeyCredential(accountName, accountKey);
      this.azureClient = BlobServiceClient.fromConnectionString(connectionString);
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

  /**
   * Upload a file to the configured storage provider and return a public URL
   */
  async uploadFile(filePath: string, fileName: string, mimeType: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const fileStream = fs.createReadStream(filePath);
      const fileStat = fs.statSync(filePath);

      if (storageDriver === 's3') {
        const bucket = process.env.AWS_BUCKET_NAME!;
        await this.s3!.upload({
          Bucket: bucket,
          Key: fileName,
          Body: fileStream,
          ContentType: mimeType,
          ACL: 'public-read',
        }).promise();

        fs.unlinkSync(filePath);
        return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
      }

      if (storageDriver === 'azure') {
        const containerName = process.env.AZURE_CONTAINER_NAME || 'uploads';
        const containerClient = this.azureClient!.getContainerClient(containerName);
      
        await containerClient.createIfNotExists();
        const blobClient = containerClient.getBlockBlobClient(fileName);

        await blobClient.uploadStream(fileStream, undefined, undefined, {
          blobHTTPHeaders: { blobContentType: mimeType },
        });
      
        fs.unlinkSync(filePath);

        const sasToken = generateBlobSASQueryParameters(
          {
            containerName,
            blobName: fileName,
            permissions: BlobSASPermissions.parse('r'), // read only
            expiresOn: new Date(Date.now() + 60 * 60 * 1000),
          },
          this.azureCredential!
        ).toString();
      
        const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!;
        return `https://${accountName}.blob.core.windows.net/${containerName}/${fileName}?${sasToken}`;
      }

      const bucket = process.env.MINIO_BUCKET!;
      const bucketExists = await this.minio!.bucketExists(bucket).catch(() => false);
      if (!bucketExists) {
        await this.minio!.makeBucket(bucket, 'us-east-1');
        logger.info(`📦 Created new MinIO bucket: ${bucket}`);
      }

      await this.minio!.putObject(bucket, fileName, fileStream, fileStat.size, {
        'Content-Type': mimeType,
      });

      fs.unlinkSync(filePath);
      logger.info(`✅ Uploaded file to MinIO: ${fileName}`);

      const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
      return `${protocol}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${bucket}/${fileName}`;
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

  async downloadAzureFile(blobName: string, downloadPath: string): Promise<void> {
    if (storageDriver !== 'azure') throw new Error('Not using Azure storage');
    const containerName = process.env.AZURE_CONTAINER_NAME || 'uploads';
    const containerClient = this.azureClient!.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.downloadToFile(downloadPath);
    logger.info(`⬇️ File downloaded to ${downloadPath}`);
  };
  
}
