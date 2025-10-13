import { Request, Response } from 'express';

export const healthController = async (req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime(), success: true });
};
