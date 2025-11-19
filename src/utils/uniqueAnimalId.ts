import Counter from "../models/counter.model";
import AnimalModel from "../models/animal.model";

const COUNTER_KEY = "animal_unified_number";
const PREFIX = "M-";

export const generateUnifiedAnimalId = async (): Promise<string> => {
  // atomically increment → 0→1, 1→2, …
  const counter = await Counter.findOneAndUpdate(
    { key: COUNTER_KEY },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );

  let nextNumber = counter.value; // 1, 2, 3...

  // Absolute safety (rarely needed but Ruby-style)
  while (await AnimalModel.exists({ uniqueAnimalId: `${PREFIX}${nextNumber}` })) {
    nextNumber++;
    await Counter.updateOne({ key: COUNTER_KEY }, { value: nextNumber });
  }

  return `${PREFIX}${nextNumber}`;
};
