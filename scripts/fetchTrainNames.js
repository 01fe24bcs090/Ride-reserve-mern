const fs = require('fs');
const path = require('path');

async function fetchTrainName(trainNo) {
    try {
        const cleanNo = trainNo.replace(/[^0-9]/g, '');
        if (!cleanNo) return null;
        
        const response = await fetch(`https://rappid.in/apis/train.php?train_no=${cleanNo}`);
        const data = await response.json();
        
        if (data.success && data.train_name) {
            const name = data.train_name.replace(/ Running Status$/i, '').replace(/ Status$/i, '').trim();
            let platform = null;
            
            if (data.data && Array.isArray(data.data)) {
                const ublStation = data.data.find(s => 
                    s.station_name && s.station_name.toLowerCase().includes('hubballi')
                );
                if (ublStation) {
                    platform = ublStation.platform;
                }
            }
            
            return { name, platform };
        }
    } catch (error) {
        console.error(`Error fetching train ${trainNo}:`, error.message);
    }
    return null;
}

async function main() {
    const csvPath = path.resolve(__dirname, '../TRAIN_TIMINGS.csv');
    if (!fs.existsSync(csvPath)) {
        console.error('TRAIN_TIMINGS.csv not found');
        return;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n');
    const header = lines[0];
    const rows = lines.slice(1).filter(line => line.trim() !== '');

    const trainNumbers = new Set();
    rows.forEach(line => {
        const parts = line.split(',');
        if (parts[2]) {
            const numbers = parts[2].split(/[\/\-]/);
            numbers.forEach(n => {
                const clean = n.trim().split(' ')[0].replace(/[^0-9]/g, '');
                if (clean) trainNumbers.add(clean);
            });
        }
    });

    console.log(`Found ${trainNumbers.size} unique train numbers. Fetching names...`);

    const trainMap = {};
    const numbersArray = Array.from(trainNumbers);
    
    // Fetch in small batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < numbersArray.length; i += batchSize) {
        const batch = numbersArray.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1} / ${Math.ceil(numbersArray.length / batchSize)}...`);
        
        const results = await Promise.all(batch.map(async (no) => {
            const result = await fetchTrainName(no);
            return { no, ...result };
        }));

        results.forEach(res => {
            if (res.name) {
                trainMap[res.no] = { name: res.name, platform: res.platform };
            }
        });
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Save map for reference
    fs.writeFileSync(path.resolve(__dirname, '../train_names.json'), JSON.stringify(trainMap, null, 2));
    console.log('Saved train_names.json');

    // Update CSV
    const updatedLines = [header];
    rows.forEach(line => {
        const parts = line.split(',');
        const trainNoField = parts[2] || '';
        
        if (trainNoField) {
            const numbers = trainNoField.split(/[\/\-]/);
            const firstNo = numbers[0].trim().split(' ')[0].replace(/[^0-9]/g, '');
            const trainData = trainMap[firstNo];
            
            if (trainData) {
                // Update Name if empty
                if (!parts[3]) {
                    parts[3] = trainData.name;
                }
                // Update Platform if it's a station code or empty
                const currentPlatform = (parts[11] || '').trim();
                if (!currentPlatform || currentPlatform.length > 2 || /^[A-Z]+$/.test(currentPlatform)) {
                    if (trainData.platform && trainData.platform !== '-') {
                        parts[11] = trainData.platform;
                    }
                }
            }
        }
        updatedLines.push(parts.join(','));
    });

    fs.writeFileSync(csvPath, updatedLines.join('\n'));
    console.log('Updated TRAIN_TIMINGS.csv with train names');
}

main();
