import { IUserDocument } from '../models/user';

declare global {
  namespace Express {
    interface Request {
      user?: Partial<IUser>;
    }
  }
}
