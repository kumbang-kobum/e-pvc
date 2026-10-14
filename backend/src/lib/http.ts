import { NextFunction, Request, Response } from "express";

// Error aplikasi dengan status HTTP eksplisit.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Bungkus handler async agar error-nya diteruskan ke error middleware (Express 4).
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
