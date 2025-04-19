import { Redis } from '@upstash/redis';

// --- Инициализация Upstash Redis ---
// Ожидает UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN в переменных окружения
let redis;
try {
  redis = Redis.fromEnv();
  console.log("--- Redis client initialized for API Route ---");
} catch (error) {
  console.error("!!! CRITICAL ERROR: Missing Upstash Redis environment variables in API Route!", error);
  // Если не удалось инициализировать, API не сможет работать с базой
}
const ENTRIES_KEY = 'entries'; // Ключ для хранения данных
// ------------------------------------

// --- Функции для работы с Upstash Redis (оставляем здесь же для простоты) ---

// Чтение данных из Redis
async function readDataFromRedis() {
  if (!redis) throw new Error('API Route: Redis client not initialized');
  try {
    console.log("--- API Route: Attempting redis.get for key:", ENTRIES_KEY);
    const dataString = await redis.get(ENTRIES_KEY);
    console.log("--- API Route: Successfully executed redis.get. Raw dataString:", dataString);
    if (dataString) {
      return JSON.parse(dataString);
    }
    return [];
  } catch (error) {
    console.error("!!! API Route: RAW ERROR in readDataFromRedis:", error);
    throw new Error('API Route: Could not read data from Redis storage');
  }
}

// Запись данных в Redis
async function writeDataToRedis(data) {
  if (!redis) throw new Error('API Route: Redis client not initialized');
  try {
    const dataToSet = JSON.stringify(data);
    console.log("--- API Route: Attempting redis.set for key:", ENTRIES_KEY);
    await redis.set(ENTRIES_KEY, dataToSet);
    console.log("--- API Route: Successfully executed redis.set");
  } catch (error) {
    console.error("!!! API Route: RAW ERROR in writeDataToRedis:", error);
    throw new Error('API Route: Could not write data to Redis storage');
  }
}

// --- Обработчик API запросов ---
export default async function handler(req, res) {
  // Проверяем инициализацию Redis при каждом запросе
  if (!redis) {
    return res.status(500).json({ message: "API Route: Redis client not initialized. Check env vars." });
  }

  const { method } = req;
  const { slug } = req.query; // slug будет массивом [id] для /api/entries/[id]
  const entryId = slug?.[0]; // Получаем ID, если он есть

  try {
    switch (method) {
      case 'GET':
        // Обработка GET /api/entries
        const data = await readDataFromRedis();
        const sortedData = data.sort((a, b) => new Date(b.departureTime) - new Date(a.departureTime));
        res.status(200).json(sortedData);
        break;

      case 'POST':
        // Обработка POST /api/entries
        const { departureTime, estimatedDuration } = req.body;
        if (!departureTime || typeof estimatedDuration !== 'number' || estimatedDuration <= 0) {
          return res.status(400).json({ message: 'Invalid input...' });
        }
        const departureDate = new Date(departureTime);
        if (isNaN(departureDate)) {
            return res.status(400).json({ message: 'Invalid departureTime format...' });
        }

        const currentDataPost = await readDataFromRedis();
        const newEntry = {
          id: Date.now().toString(),
          departureTime: departureDate.toISOString(),
          estimatedDuration: parseInt(estimatedDuration, 10),
          returnTime: null,
          lateBy: null,
        };
        currentDataPost.push(newEntry);
        await writeDataToRedis(currentDataPost);
        res.status(201).json(newEntry);
        break;

      case 'PUT':
        // Обработка PUT /api/entries/[id]
        if (!entryId) {
            return res.status(400).json({ message: 'Missing entry ID for PUT request' });
        }
        const { returnTime } = req.body;
        if (!returnTime) {
            return res.status(400).json({ message: 'Missing returnTime...' });
        }
        const returnDate = new Date(returnTime);
        if (isNaN(returnDate)) {
            return res.status(400).json({ message: 'Invalid returnTime format...' });
        }

        const currentDataPut = await readDataFromRedis();
        const entryIndex = currentDataPut.findIndex(entry => entry.id === entryId);

        if (entryIndex === -1) {
            return res.status(404).json({ message: 'Entry not found' });
        }

        const entry = currentDataPut[entryIndex];
        if (entry.returnTime) {
            return res.status(400).json({ message: 'Entry already has a return time' });
        }

        const depDate = new Date(entry.departureTime);
        if(returnDate < depDate) {
            return res.status(400).json({ message: 'Return time cannot be earlier...' });
        }

        entry.returnTime = returnDate.toISOString();
        const expectedReturn = new Date(depDate.getTime() + entry.estimatedDuration * 60000);
        const diffMillis = returnDate - expectedReturn;
        entry.lateBy = Math.max(0, Math.round(diffMillis / 60000));

        currentDataPut[entryIndex] = entry;
        await writeDataToRedis(currentDataPut);
        res.status(200).json(entry);
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(`!!! API Route Error (${method} /api/entries/${entryId || ''}):`, error);
    res.status(500).json({
        message: `API Route: Failed to process request - ${error.message || 'Unknown error'}`,
        details: error.message
     });
  }
}
