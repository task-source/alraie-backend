import createError from "http-errors";
import { getActiveSubscription } from "./getActiveSubscription";
import Animal from "../models/animal.model";
import User from "../models/user";

export async function assertQuota(
  ownerId: string,
  type: "animal" | "assistant",
  t: (key: string) => string
) {
  const resolved = await getActiveSubscription(ownerId);
  if (!resolved) {
    throw createError(403, t("NO_ACTIVE_SUBSCRIPTION"));
  }

  const { plan } = resolved;

  if (type === "animal") {
    const count = await Animal.countDocuments({
      ownerId,
      animalStatus: { $ne: "inactive" },
    });

    if (count >= plan.maxAnimals) {
      throw createError(403, t("ANIMAL_LIMIT_REACHED"));
    }
  }

  if (type === "assistant") {
    const count = await User.countDocuments({
      ownerId,
      role: "assistant",
    });

    if (count >= plan.maxAssistants) {
      throw createError(403, t("ASSISTANT_LIMIT_REACHED"));
    }
  }
}
