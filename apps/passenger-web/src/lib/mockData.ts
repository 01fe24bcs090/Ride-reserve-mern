export const mockTrainByNumber: Record<
  string,
  {
    trainNumber: string;
    trainName: string;
    origin: string;
    destination: string;
    platformNumber: string;
    scheduledArrival: string | null;
    scheduledDeparture: string | null;
    isActive: boolean;
  }
> = {
  "17313": {
    trainNumber: "17313",
    trainName: "Hubli Passenger",
    origin: "Belagavi",
    destination: "Hubli",
    platformNumber: "2",
    scheduledArrival: "10:45",
    scheduledDeparture: null,
    isActive: true,
  },
  "16590": {
    trainNumber: "16590",
    trainName: "Rani Chennamma Express",
    origin: "Bengaluru",
    destination: "Mumbai CST",
    platformNumber: "4",
    scheduledArrival: "18:20",
    scheduledDeparture: "18:35",
    isActive: true,
  },
};

export const platformOptions = ["1", "2", "3", "4", "5", "6"];
export const pickupPoints = ["Point A", "Point B", "Point C", "Point D"];
