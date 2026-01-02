import DeletionJob from "../models/deletionJob.model";
import Animal from "../models/animal.model";
import User from "../models/user";
import { logger } from "../utils/logger";
import GpsDevice from "../models/gps.model";
import gpsLocationModel from "../models/gpsLocation.model";
import mongoose from "mongoose";
import { FileService } from "../services/fileService";
import deletedUsersModel from "../models/deletedUsers.model";

const ANIMAL_BATCH = 100;
const ASSISTANT_BATCH = 50;

export async function processDeletionJobs() {
  const jobs = await DeletionJob.find({
    status: { $in: ["pending", "processing"] },
  }).limit(5);

  for (const job of jobs) {
    try {
      job.status = "processing";
      await job.save();

  
      const ownerExists = await User.exists({ _id: job.ownerId });
      if (!ownerExists) {
        job.status = "completed";
        job.error = "OWNER_DELETED";
        await job.save();
        continue;
      }

      if (job.target === "animal") {
        await deleteOverflowAnimals(job);
      } else {
        await deleteOverflowAssistants(job);
      }
    } catch (err: any) {
      job.status = "failed";
      job.error = err.message;
      await job.save();
      logger.error("Deletion job failed", err);
    }
  }
}

export async function deleteOverflowAnimals(job: any) {
  const query: any = { ownerId: job.ownerId };

  if (job.lastProcessedId) {
    query._id = { $lt: job.lastProcessedId };
  }

  const animals = await Animal.find(query)
    .sort({ createdAt: -1 })
    .limit(job.keep + ANIMAL_BATCH);

  const toDelete = animals.slice(job.keep);
  if (toDelete.length === 0) {
    job.status = "completed";
    await job.save();
    return;
  }

  const fileService = new FileService();

  for (const animal of toDelete) {

    const allImageUrls: string[] = [
      ...(animal.images || []),
      ...(animal.profilePicture ? [animal.profilePicture] : []),
    ];

    await Promise.allSettled(
      allImageUrls.map((url) => fileService.deleteFile(url))
    );


    if (animal.gpsDeviceId) {
      await GpsDevice.updateOne(
        { _id: animal.gpsDeviceId },
        { $set: { isLinked: false, animalId: null, linkedAt: null } }
      );

      await gpsLocationModel.deleteMany({
        gpsDeviceId: animal.gpsDeviceId,
      });
    }


    await mongoose
      .model("AnimalReport")
      .deleteMany({ animalId: animal._id });


    await animal.deleteOne();

    job.lastProcessedId = animal._id;
  }

  job.status =
    toDelete.length < ANIMAL_BATCH ? "completed" : "processing";

  await job.save();
}


export async function deleteOverflowAssistants(job: any) {
  const query: any = {
    ownerId: job.ownerId,
    role: "assistant",
  };

  if (job.lastProcessedId) {
    query._id = { $lt: job.lastProcessedId };
  }

  const assistants = await User.find(query)
    .sort({ createdAt: -1 })
    .limit(job.keep + ASSISTANT_BATCH);

  const toDelete = assistants.slice(job.keep);
  if (toDelete.length === 0) {
    job.status = "completed";
    await job.save();
    return;
  }

  const fileService = new FileService();

  for (const assistant of toDelete) {

    if (assistant.ownerId) {
      await User.updateOne(
        { _id: assistant.ownerId },
        { $pull: { assistantIds: assistant._id } }
      );
    }


    if (assistant.profileImage) {
      await fileService.deleteFile(assistant.profileImage);
    }


    await deletedUsersModel.create({
      userId: assistant._id,
      role: assistant.role,
      name: assistant.name,
      email: assistant.email,
      phone: assistant.phone,
      fullPhone: assistant.fullPhone,
      country: assistant.country,
      preferredCurrency: assistant.preferredCurrency,
      animalType: assistant.animalType,
      language: assistant.language,
      deletionReason: "SUBSCRIPTION_DOWNGRADE",
      deletedBy: job.ownerId,
    });


    await assistant.deleteOne();

    job.lastProcessedId = assistant._id;
  }

  job.status =
    toDelete.length < ASSISTANT_BATCH ? "completed" : "processing";

  await job.save();
}
