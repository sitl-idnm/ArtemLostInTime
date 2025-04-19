const express = require('express');
const cors = require('cors');
// const bodyParser = require('body-parser'); // Необязательно для новых Express
const fs = require('fs');
const path = require('path');
const basicAuth = require('express-basic-auth'); // Добавили basic-auth

const app = express();
const PORT = process.env.PORT || 3001; // Порт для API
const DATA_FILE = path.join(__dirname, 'data.json');
// const ALLOWED_IP = '178.218.117.70'; // <<< Замени на свой IP
const ALLOWED_IPS = [
  '178.218.117.70', // Основной IP
  '127.0.0.1',      // localhost IPv4
  '::ffff:127.0.0.1', // localhost IPv6 mapped IPv4
  '::1'             // localhost IPv6
];

// --- Настройка Basic Auth ---
// ВАЖНО: Замени 'admin' и 'password' на свои надежные данные!
const adminUser = { 'admin': 'password' };

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

// Маршруты (Эндпоинты)

// GET /entries - Получить все записи
app.get('/entries', (req, res) => {
  const data = readData();
  // Сортируем по времени ухода (сначала новые)
  const sortedData = data.sort((a, b) => new Date(b.departureTime) - new Date(a.departureTime));
  res.json(sortedData);
});

// POST /entries - Добавить новую запись
app.post('/entries', (req, res) => {
  const { departureTime, estimatedDuration } = req.body;
  // Простая валидация
  if (!departureTime || typeof estimatedDuration !== 'number' || estimatedDuration <= 0) {
    return res.status(400).send('Invalid input: departureTime (ISO string) and estimatedDuration (positive number in minutes) are required.');
  }

  try {
      const departureDate = new Date(departureTime);
      if (isNaN(departureDate)) {
          return res.status(400).send('Invalid departureTime format. Use ISO 8601 format (e.g., 2023-10-27T10:00:00.000Z)');
      }

      const data = readData();
      const newEntry = {
        id: Date.now().toString(), // Простой способ генерации ID
        departureTime: departureDate.toISOString(), // Храним в ISO формате
        estimatedDuration: parseInt(estimatedDuration, 10), // В минутах
        returnTime: null,
        lateBy: null, // В минутах
      };
      data.push(newEntry);
      writeData(data);
      res.status(201).json(newEntry);
  } catch (error) {
      console.error("Error processing POST /entries:", error);
      res.status(500).send("Internal Server Error");
  }
});

// PUT /entries/:id - Обновить запись (приход)
app.put('/entries/:id', (req, res) => {
  const { id } = req.params;
  const { returnTime } = req.body;

  if (!returnTime) {
    return res.status(400).send('Missing returnTime (ISO string)');
  }

  try {
      const returnDate = new Date(returnTime);
       if (isNaN(returnDate)) {
          return res.status(400).send('Invalid returnTime format. Use ISO 8601 format (e.g., 2023-10-27T11:30:00.000Z)');
      }

      const data = readData();
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
           return res.status(400).send('Return time cannot be earlier than departure time.');
       }

      entry.returnTime = returnDate.toISOString();

      // Расчет опоздания
      const expectedReturn = new Date(departureDate.getTime() + entry.estimatedDuration * 60000); // Добавляем минуты к времени ухода
      const diffMillis = returnDate - expectedReturn;
      entry.lateBy = Math.max(0, Math.round(diffMillis / 60000)); // Опоздание в минутах (не отрицательное)


      data[entryIndex] = entry;
      writeData(data);
      res.json(entry);
  } catch (error) {
      console.error(`Error processing PUT /entries/${id}:`, error);
      res.status(500).send("Internal Server Error");
  }
});


// Запуск сервера
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Data will be stored in: ${DATA_FILE}`);
  console.log(`Admin page at http://localhost:${PORT}/admin.html (Login: admin/password)`); // Добавили инфо про admin
});

// Обработка сигналов для корректного завершения (например, при Ctrl+C)
process.on('SIGINT', () => {
  console.log('Server shutting down...');
  process.exit();
});

// Функция для чтения данных
const readData = () => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([])); // Создаем файл, если его нет
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading data file:", err);
    return []; // Возвращаем пустой массив в случае ошибки
  }
};

// Функция для записи данных
const writeData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); // Записываем с форматированием
  } catch (err) {
    console.error("Error writing data file:", err);
  }
};
