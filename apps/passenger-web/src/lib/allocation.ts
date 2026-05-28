import api from "../api/client";

const BASE_FARE = 20;

export interface BookingAllocationInput {
  passengerId: string;
  passengerName: string;
  trainNumber: string;
  toPlatform: string;
  seats: number;
  journeyType: "arrival" | "departure";
  lookupType: "pnr" | "trainNumber";
  pnr?: string | null;
  pickupPoint?: string | null;
  luggageType: "none" | "light" | "heavy";
  isPriorityPassenger: boolean;
  passengerCount: number;
}

function parseHmToMinutes(value: string): number {
  if (!value) return 0;
  const [hPart, mPart] = value.split(":");
  const h = Number(hPart);
  const m = Number(mPart);
  if (hPart === undefined || mPart === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Invalid time format: ${value}. Expected HH:MM.`);
  }
  return h * 60 + m;
}

export async function evaluatePeakFare(scheduledHm: string): Promise<{
  isPeakHour: boolean;
  fare: number;
  multiplier: number;
}> {
  const { data: peakHours } = await api.get('/peakhours');
  const target = parseHmToMinutes(scheduledHm);
  let multiplier = 1;

  for (const peak of peakHours) {
    if (!peak.startTime || !peak.endTime || !peak.multiplier) continue;

    const start = parseHmToMinutes(peak.startTime);
    const end = parseHmToMinutes(peak.endTime);
    const inWindow = target >= start && target <= end;

    if (inWindow && peak.multiplier > multiplier) {
      multiplier = Number(peak.multiplier);
    }
  }

  return {
    isPeakHour: multiplier > 1,
    multiplier,
    fare: Math.round(BASE_FARE * multiplier),
  };
}

export async function estimateFareClientSide(trainNumber: string, journeyType: "arrival" | "departure") {
  const { data: trains } = await api.get('/trains');
  const train = trains.find((t: any) => t.trainNumber === trainNumber);
  
  if (!train) {
    throw new Error("Train not found");
  }
  if (!train.isActive) {
    throw new Error("This train is currently inactive");
  }

  const scheduledHm =
    journeyType === "arrival"
      ? train.scheduledArrival ?? train.scheduledDeparture
      : train.scheduledDeparture ?? train.scheduledArrival;
  
  if (!scheduledHm) {
    throw new Error("Train schedule data is incomplete");
  }

  const fareInfo = await evaluatePeakFare(scheduledHm);
  return {
    baseFare: BASE_FARE,
    fare: fareInfo.fare,
    multiplier: fareInfo.multiplier,
    isPeakHour: fareInfo.isPeakHour,
    fromPlatform: train.platformNumber,
  };
}

