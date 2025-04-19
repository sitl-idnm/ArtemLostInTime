const express = require('express');
const cors = require('cors');
// const bodyParser = require('body-parser'); // Необязательно для новых Express
const path = require('path'); // <<< ВОЗВРАЩАЕМ path
// const basicAuth = require('express-basic-auth'); // <<< Убрали basic-auth
// const { kv } = require('@vercel/kv'); // <<< Убрали @vercel/kv
const { Redis } = require('@upstash/redis'); // <<< Добавили @upstash/redis

// <<< ЛОГИРУЕМ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ >>>
console.log("--- Checking Environment Variables ---");
console.log("UPSTASH_REDIS_REST_URL exists:", !!process.env.UPSTASH_REDIS_REST_URL);
console.log("UPSTASH_REDIS_REST_TOKEN exists:", !!process.env.UPSTASH_REDIS_REST_TOKEN);
console.log("------------------------------------");

const app = express();
// const PORT = process.env.PORT || 3001; // <<< PORT больше не нужен, Vercel управляет этим
// const DATA_FILE = path.join(__dirname, 'data.json'); // <<< Больше не используем файл
const ALLOWED_IPS = [
  '178.218.117.70', // Основной IP
  '127.0.0.1',      // localhost IPv4
  '::ffff:127.0.0.1', // localhost IPv6 mapped IPv4
  '::1'             // localhost IPv6
];

// --- Настройка Basic Auth ---
// Читаем из переменных окружения Vercel (или используем дефолтные для локальной разработки)
// const adminUsername = process.env.ADMIN_USER || 'admin';
// const adminPassword = process.env.ADMIN_PASSWORD || 'password';
// const adminUser = { [adminUsername]: adminPassword };

// const unauthorizedResponse = (req) => {
//     return req.auth
//         ? ('Credentials ' + req.auth.user + ':' + req.auth.password + ' rejected')
//         : 'No credentials provided';
// };

// const adminAuth = basicAuth({
//     users: adminUser,
//     challenge: true, // Показывать стандартное окно входа в браузере
//     unauthorizedResponse: unauthorizedResponse
// });
// --- Конец настройки Basic Auth ---


// Middleware
// Настройка CORS - разрешить запросы с твоего основного сайта
// const corsOptions = {
//   origin: 'http://твой-основной-сайт.com', // <<< Укажи домен основного сайта
//   optionsSuccessStatus: 200
// };
// app.use(cors(corsOptions));

app.use(cors()); // Пока разрешим все для простоты
app.use(express.json()); // Для парсинга JSON тел запросов
// app.use(bodyParser.json()); // Старый вариант

// Middleware для Basic Auth - ПРИМЕНЯЕМ ТОЛЬКО К /admin.html
// Все остальные файлы будут доступны без аутентификации
// app.get('/admin.html', adminAuth, (req, res) => {
//   // Если adminAuth пропустил (успешная аутентификация), отправляем файл
//   res.sendFile(path.join(__dirname, 'admin.html'));
// });

// --- Обработчики для статики (без аутентификации) ---
// Обработчик для корневого пути /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// <<< Добавляем обработчик для /admin.html
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- Инициализация Upstash Redis ---
// Ожидает UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN в переменных окружения
const redis = Redis.fromEnv();
const ENTRIES_KEY = 'entries'; // Ключ для хранения данных
// ------------------------------------

// --- Функции для работы с Upstash Redis ---

// Чтение данных из Redis
async function readDataFromRedis() {
  try {
    console.log("--- Attempting redis.get for key:", ENTRIES_KEY); // Лог перед операцией
    const dataString = await redis.get(ENTRIES_KEY);
    console.log("--- Successfully executed redis.get. Raw dataString:", dataString); // Лог после успеха
    if (dataString) {
      return JSON.parse(dataString);
    }
    return [];
  } catch (error) {
    // <<< Упрощаем логирование ошибки
    console.error("!!! RAW ERROR in readDataFromRedis:", error);
    throw new Error('Could not read data from Redis storage');
  }
}

// Запись данных в Redis
async function writeDataToRedis(data) {
  try {
    const dataToSet = JSON.stringify(data);
    console.log("--- Attempting redis.set for key:", ENTRIES_KEY); // Лог перед операцией
    await redis.set(ENTRIES_KEY, dataToSet);
    console.log("--- Successfully executed redis.set"); // Лог после успеха
  } catch (error) {
    // <<< Упрощаем логирование ошибки
    console.error("!!! RAW ERROR in writeDataToRedis:", error);
    throw new Error('Could not write data to Redis storage');
  }
}

// --- Маршруты API (Эндпоинты) ---

// GET /entries - Получить все записи
app.get('/entries', async (req, res) => {
  try {
    const data = await readDataFromRedis();
    const sortedData = data.sort((a, b) => new Date(b.departureTime) - new Date(a.departureTime));
    res.json(sortedData);
  } catch (error) {
    console.error("!!! RAW ERROR from GET /entries catch:", error);
    res.status(500).json({ message: "Could not read data from storage", details: error.message || String(error) });
  }
});

// POST /entries - Добавить новую запись
app.post('/entries', async (req, res) => {
  const { departureTime, estimatedDuration } = req.body;
  if (!departureTime || typeof estimatedDuration !== 'number' || estimatedDuration <= 0) {
    return res.status(400).send('Invalid input...'); // Сообщение можно оставить
  }

  try {
      const departureDate = new Date(departureTime);
      if (isNaN(departureDate)) {
          return res.status(400).send('Invalid departureTime format...');
      }

      const data = await readDataFromRedis();
      const newEntry = {
        id: Date.now().toString(),
        departureTime: departureDate.toISOString(),
        estimatedDuration: parseInt(estimatedDuration, 10),
        returnTime: null,
        lateBy: null,
      };
      data.push(newEntry);
      await writeDataToRedis(data);
      res.status(201).json(newEntry);

  } catch (error) {
      console.error("!!! RAW ERROR from POST /entries catch:", error);
      res.status(500).json({ message: "Could not write data to storage", details: error.message || String(error) });
  }
});

// PUT /entries/:id - Обновить запись (приход)
app.put('/entries/:id', async (req, res) => {
  const { id } = req.params;
  const { returnTime } = req.body;

  if (!returnTime) {
    return res.status(400).send('Missing returnTime...');
  }

  try {
      const returnDate = new Date(returnTime);
      if (isNaN(returnDate)) {
          return res.status(400).send('Invalid returnTime format...');
      }

      const data = await readDataFromRedis();
      const entryIndex = data.findIndex(entry => entry.id === id);

      if (entryIndex === -1) {
        return res.status(404).send('Entry not found');
      }

      const entry = data[entryIndex];
      if (entry.returnTime) {
          return res.status(400).send('Entry already has a return time');
      }

       const departureDate = new Date(entry.departureTime);
       if(returnDate < departureDate) {
           return res.status(400).send('Return time cannot be earlier...');
       }

      entry.returnTime = returnDate.toISOString();
      const expectedReturn = new Date(departureDate.getTime() + entry.estimatedDuration * 60000);
      const diffMillis = returnDate - expectedReturn;
      entry.lateBy = Math.max(0, Math.round(diffMillis / 60000));

      data[entryIndex] = entry;
      await writeDataToRedis(data);
      res.json(entry);

  } catch (error) {
      const entryId = req.params.id;
      console.error(`!!! RAW ERROR from PUT /entries/${entryId} catch:`, error);
      res.status(500).json({ message: `Could not update entry ${entryId}`, details: error.message || String(error) });
  }
});

// --- Статические файлы ---
// <<< УБЕДИМСЯ, ЧТО express.static УДАЛЕН
// app.use(express.static(__dirname));

// --- ЭКСПОРТИРУЕМ ПРИЛОЖЕНИЕ ДЛЯ VERCEL ---
module.exports = app;


// --- УБИРАЕМ ОБРАБОТКУ SIGINT ---
/*
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  process.exit();
});
*/
