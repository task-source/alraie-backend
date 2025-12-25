import { Request, Response } from "express";
import createError from "http-errors";
import { asyncHandler } from "../middleware/asyncHandler";
import contactUsModel from "../models/contactUss.model";
import { Types } from "mongoose";
import UserModel from '../models/user';


export const submitContactUs = asyncHandler(
  async (req: any, res: Response) => {
    let { name, email, phone, message, userId } = req.body;

    if (!name || !message) {
      throw createError(400, "NAME_AND_MESSAGE_REQUIRED");
    }

    if (!email && !phone) {
      throw createError(400, "EMAIL_OR_PHONE_REQUIRED");
    }

    userId = typeof userId === "string" && userId.trim() !== ""
      ? userId.trim()
      : null;

      if (userId) {
        if (!Types.ObjectId.isValid(userId)) {
          throw createError(400, "INVALID_USER_ID");
        }
  
        const user = await UserModel.findById(userId).select("_id");
        if (!user) {
          throw createError(404, req.t("USER_NOT_FOUND"));
        }
      }

      const payload: any = {
        name,
        email,
        phone,
        message,
      };
      if (userId) {
        payload.userId = new Types.ObjectId(String(userId));
      }
  
    const created = await contactUsModel.create(payload);

    res.status(201).json({
      success: true,
      message: req.t?.("CONTACT_REQUEST_SUBMITTED") ?? "Message sent successfully",
      id: created._id,
    });
  }
);

export const listContactUs = asyncHandler(
    async (req: Request, res: Response) => {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Number(req.query.limit || 20));
      const skip = (page - 1) * limit;
  
      const filter: any = {};
  
      if (req.query.search) {
        const s = String(req.query.search);
        filter.$or = [
          { name: { $regex: s, $options: "i" } },
          { email: { $regex: s, $options: "i" } },
          { phone: { $regex: s, $options: "i" } },
          { message: { $regex: s, $options: "i" } },
        ];
      }
  
      if (req.query.fromDate || req.query.toDate) {
        filter.createdAt = {};
  
        if (req.query.fromDate) {
          const from = new Date(String(req.query.fromDate));
          if (isNaN(from.getTime())) {
            throw createError(400, "INVALID_FROM_DATE");
          }
          filter.createdAt.$gte = from;
        }
  
        if (req.query.toDate) {
          const to = new Date(String(req.query.toDate));
          if (isNaN(to.getTime())) {
            throw createError(400, "INVALID_TO_DATE");
          }
          filter.createdAt.$lte = to;
        }
      }
  
      let sort: any = {};
      switch (req.query.sort) {
        case "date_oldest":
          sort.createdAt = 1;
          break;
  
        case "name_asc":
          sort.name = 1;
          break;
  
        case "name_desc":
          sort.name = -1;
          break;
  
        case "email_asc":
          sort.email = 1;
          break;
  
        case "email_desc":
          sort.email = -1;
          break;
  
        case "date_latest":
        default:
          sort.createdAt = -1;
          break;
      }
  
      const [items, total] = await Promise.all([
        contactUsModel
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        contactUsModel.countDocuments(filter),
      ]);
  
      res.json({
        success: true,
        items,
        total,
        page,
        limit,
      });
    }
);
  
