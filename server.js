const express = require('express');
const cors = require('cors');
// const bodyParser = require('body-parser'); // Необязательно для новых Express
const path = require('path');
const basicAuth = require('express-basic-auth'); // Добавили basic-auth
const { kv } = require('@vercel/kv'); // <<< Добавили Vercel KV

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
const adminUsername = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'password';
const adminUser = { [adminUsername]: adminPassword };

const unauthorizedResponse = (req) => {
    return req.auth
        ? ('Credentials ' + req.auth.user + ':' + req.auth.password + ' rejected')
        : 'No credentials provided';
};

const adminAuth = basicAuth({
    users: adminUser,
    challenge: true, // Показывать стандартное окно входа в браузере
    unauthorizedResponse: unauthorizedResponse
});
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
app.get('/admin.html', adminAuth);

// Статические файлы (HTML, CSS, JS) - отдает файлы из текущей папки
// Должно быть после аутентификации для admin.html, но до API-маршрутов
app.use(express.static(__dirname));

// --- Функции для работы с Vercel KV ---
const ENTRIES_KEY = 'entries'; // Ключ для хранения данных в KV

// Чтение данных из KV
async function readDataFromKV() {
  try {
    const data = await kv.get(ENTRIES_KEY);
    return data || []; // Возвращаем пустой массив, если данных нет
  } catch (error) {
    console.error("Error reading from Vercel KV:", error);
    throw new Error('Could not read data from storage'); // Передаем ошибку дальше
  }
}

// Запись данных в KV
async function writeDataToKV(data) {
  try {
    await kv.set(ENTRIES_KEY, data);
  } catch (error) {
    console.error("Error writing to Vercel KV:", error);
    throw new Error('Could not write data to storage');
  }
}

// --- Маршруты API (Эндпоинты) ---

// GET /entries - Получить все записи
app.get('/entries', async (req, res) => { // <<< Делаем async
  try {
    const data = await readDataFromKV(); // <<< Читаем из KV
    const sortedData = data.sort((a, b) => new Date(b.departureTime) - new Date(a.departureTime));
    res.json(sortedData);
  } catch (error) {
    console.error("Error in GET /entries:", error);
    res.status(500).send(error.message || "Internal Server Error");
  }
});

// POST /entries - Добавить новую запись
app.post('/entries', async (req, res) => { // <<< Делаем async
  const { departureTime, estimatedDuration } = req.body;
  if (!departureTime || typeof estimatedDuration !== 'number' || estimatedDuration <= 0) {
    return res.status(400).send('Invalid input...'); // Сообщение можно оставить
  }

  try {
      const departureDate = new Date(departureTime);
      if (isNaN(departureDate)) {
          return res.status(400).send('Invalid departureTime format...');
      }

      const data = await readDataFromKV(); // <<< Читаем из KV
      const newEntry = {
        id: Date.now().toString(),
        departureTime: departureDate.toISOString(),
        estimatedDuration: parseInt(estimatedDuration, 10),
        returnTime: null,
        lateBy: null,
      };
      data.push(newEntry);
      await writeDataToKV(data); // <<< Пишем в KV
      res.status(201).json(newEntry);

  } catch (error) {
      console.error("Error processing POST /entries:", error);
      res.status(500).send(error.message || "Internal Server Error");
  }
});

// PUT /entries/:id - Обновить запись (приход)
app.put('/entries/:id', async (req, res) => { // <<< Делаем async
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

      const data = await readDataFromKV(); // <<< Читаем из KV
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
      await writeDataToKV(data); // <<< Пишем в KV
      res.json(entry);

  } catch (error) {
      console.error(`Error processing PUT /entries/${id}:`, error);
      res.status(500).send(error.message || "Internal Server Error");
  }
});

// --- УБИРАЕМ ЗАПУСК СЕРВЕРА ---
/*
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Data will be stored in: ${DATA_FILE}`);
  console.log(`Admin page at http://localhost:${PORT}/admin.html (Login: admin/password)`);
});
*/

// --- ЭКСПОРТИРУЕМ ПРИЛОЖЕНИЕ ДЛЯ VERCEL ---
module.exports = app;


// --- УБИРАЕМ ОБРАБОТКУ SIGINT ---
/*
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  process.exit();
});
*/
