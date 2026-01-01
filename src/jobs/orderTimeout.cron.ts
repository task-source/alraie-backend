import Order from "../models/order.model";

export async function cancelExpiredOrders() {
  const now = new Date();

  const orders = await Order.find({
    status: "pending",
    reservedUntil: { $lt: now },
    stockReleased: false,
  });

  for (const order of orders) {
    const session = await Order.startSession();
    session.startTransaction();

    try {
      // for (const item of order.items) {
      //   await Product.updateOne(
      //     { _id: item.productId },
      //     { $inc: { stockQty: item.quantity } },
      //     { session }
      //   );
      // }

      order.status = "cancelled";
      order.paymentStatus = "failed";
      order.stockReleased = true;

      await order.save({ session });

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
    } finally {
      session.endSession();
    }
  }
}
