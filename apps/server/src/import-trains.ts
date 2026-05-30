import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import Train from './models/Train';

dotenv.config();

const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ride-reserve';

const importTrains = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('Connected. Dropping existing train data...');
    await Train.deleteMany({});
    
    const trainMap = new Map<string, any>();
    const csvPath = path.resolve(__dirname, '../../../TRAIN_TIMINGS.csv');
    
    console.log(`Reading CSV from: ${csvPath}`);
    
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (data: any) => {
        if (data['Train Number']) {
           const typeStr = (data['Type'] || '').toLowerCase();
           let trainType = 'arriving';
           if (typeStr.includes('departing')) trainType = 'departing';
           if (typeStr.includes('both')) trainType = 'both';

           const daysStr = data['Days'] || '';
           const daysOfOperation = daysStr.split(',').map((d: string) => d.trim()).filter(Boolean);

           const platformStr = data['Platform No'] || '';
           const platformNumber = platformStr ? `Platform ${platformStr}` : 'TBD';

           // Split by '/' to handle entries like "17314/17313" and insert all of them
           const trainNumbers = data['Train Number'].split('/').map((t: string) => t.trim());
           
           for (const trainNumber of trainNumbers) {
             if (trainNumber && !trainMap.has(trainNumber)) {
               trainMap.set(trainNumber, {
                 trainNumber,
                 trainName: data['Train Name'] || 'Unknown Train',
                 origin: data['From'] || 'Unknown',
                 destination: data['To'] || 'Unknown',
                 type: trainType,
                 scheduledArrival: data['Arrival Time'] || null,
                 scheduledDeparture: data['Departure Time'] || null,
                 platformNumber: platformNumber,
                 daysOfOperation: daysOfOperation,
                 isActive: true
               });
             }
           }
        }
      })
      .on('end', async () => {
        const results = Array.from(trainMap.values());
        console.log(`Parsed ${results.length} unique trains from CSV. Inserting...`);
        try {
            await Train.create(results);
            console.log('Train data successfully imported!');
            process.exit(0);
        } catch (err) {
            console.error('Error inserting train data:', err);
            process.exit(1);
        }
      });
  } catch (error) {
    console.error('Error connecting to DB:', error);
    process.exit(1);
  }
};

importTrains();
