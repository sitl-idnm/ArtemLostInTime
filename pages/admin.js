import React, { useState, useEffect, useCallback } from 'react';

const API_URL = '/api/entries'; // <<< Новый URL API маршрута

// Компонент для форматирования даты (извлекаем для переиспользования)
function formatDateTime(isoString) {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleString('ru-RU', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch (e) {
    console.error("Error formatting date:", e);
    return 'Invalid Date';
  }
}

// Компонент для расчета ожидаемого времени возвращения
function calculateExpectedReturn(departureTimeISO, durationMinutes) {
  if (!departureTimeISO || !durationMinutes) return null;
  try {
    const departureDate = new Date(departureTimeISO);
    if (isNaN(departureDate.getTime())) return null;
    const expectedReturnDate = new Date(departureDate.getTime() + durationMinutes * 60000);
    return expectedReturnDate.toISOString();
  } catch (e) {
    console.error("Error calculating expected return:", e);
    return null;
  }
}

export default function AdminPage() {
  const [entries, setEntries] = useState([]);
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [loading, setLoading] = useState(true);
  const [formMessage, setFormMessage] = useState({ text: '', type: 'error' });
  const [listMessage, setListMessage] = useState('');
  const [updatingId, setUpdatingId] = useState(null); // Для блокировки кнопки при обновлении

  // Функция загрузки данных
  const fetchEntries = useCallback(async () => {
    setListMessage('');
    setLoading(true);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = `${response.statusText}: ${errorData.message} - ${errorData.details || 'No details'}`;
        } catch (e) {/* Ignore JSON parsing error */}
        throw new Error(errorDetails);
      }
      const data = await response.json();
      setEntries(data);
    } catch (error) {
      console.error('Ошибка при загрузке записей:', error);
      setListMessage(`Не удалось загрузить записи: ${error.message}. Убедитесь, что API доступен.`);
      setEntries([]); // Очищаем старые данные при ошибке
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка данных при первом рендере
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Обработчик отправки формы
  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormMessage({ text: '', type: 'error' });

    const duration = parseInt(estimatedDuration, 10);
    if (isNaN(duration) || duration <= 0) {
      setFormMessage({ text: 'Пожалуйста, введите корректную длительность (положительное число минут).', type: 'error' });
      return;
    }

    const departureTime = new Date().toISOString();

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departureTime, estimatedDuration: duration })
      });

      if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
         try {
          const errorData = await response.json();
          errorDetails = `${response.statusText}: ${errorData.message} - ${errorData.details || 'No details'}`;
        } catch (e) {/* Ignore JSON parsing error */}
        throw new Error(errorDetails);
      }

      setEstimatedDuration('');
      setFormMessage({ text: 'Запись успешно добавлена!', type: 'success' });
      fetchEntries();
      setTimeout(() => setFormMessage({ text: '', type: 'error' }), 3000);

    } catch (error) {
      console.error('Ошибка при добавлении записи:', error);
      setFormMessage({ text: `Ошибка: ${error.message}`, type: 'error' });
    }
  };

  // Обработчик нажатия кнопки "Пришел"
  const handleReturn = async (entryId) => {
    setUpdatingId(entryId);
    setListMessage('');
    const returnTime = new Date().toISOString();

    try {
      const response = await fetch(`${API_URL}/${entryId}`, { // <<< URL для PUT запроса
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTime })
      });

       if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
         try {
          const errorData = await response.json();
          errorDetails = `${response.statusText}: ${errorData.message} - ${errorData.details || 'No details'}`;
        } catch (e) {/* Ignore JSON parsing error */}
        throw new Error(errorDetails);
      }

      fetchEntries();

    } catch (error) {
      console.error('Ошибка при обновлении записи:', error);
      setListMessage(`Ошибка обновления записи ID ${entryId}: ${error.message}`);
    } finally {
        setUpdatingId(null);
    }
  };

  return (
    <>
      {/* Стили перенесены сюда для простоты */}
      <style jsx global>{`
        body {
          font-family: sans-serif;
          margin: 20px;
          background-color: #f4f4f4;
        }
        h1,
        h2 {
          color: #333;
        }
        .form-section,
        .list-section {
          background-color: #fff;
          padding: 20px;
          margin-bottom: 20px;
          border-radius: 5px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        label {
          display: block;
          margin-bottom: 5px;
          color: #555;
        }
        input[type="number"] {
          width: 95%;
          padding: 10px;
          margin-bottom: 15px;
          border: 1px solid #ddd;
          border-radius: 3px;
        }
        button {
          background-color: #007bff;
          color: white;
          padding: 10px 15px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          margin-right: 5px;
          transition: background-color 0.2s ease;
        }
        button:hover {
          background-color: #0056b3;
        }
        button:disabled {
           background-color: #cccccc;
           cursor: not-allowed;
        }
        button.return-button {
          background-color: #28a745;
        }
        button.return-button:hover:not(:disabled) {
          background-color: #218838;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th,
        td {
          border: 1px solid #ddd;
          padding: 12px;
          text-align: left;
          vertical-align: middle;
        }
        th {
          background-color: #e9ecef;
          color: #495057;
        }
        tr:nth-child(even) {
          background-color: #f8f9fa;
        }
        .error-message {
          color: red;
          margin-top: 10px;
        }
        .success-message {
          color: green;
          margin-top: 10px;
        }
      `}</style>

      <h1>Управление Записями</h1>

      <div className="form-section">
        <h2>Добавить новую запись (Уход)</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="estimatedDuration">Ушел на (минут):</label>
          <input
            type="number"
            id="estimatedDuration"
            name="estimatedDuration"
            required
            min="1"
            value={estimatedDuration}
            onChange={(e) => setEstimatedDuration(e.target.value)}
          />
          <button type="submit">Отметить Уход</button>
        </form>
        {formMessage.text && (
          <div className={formMessage.type === 'success' ? 'success-message' : 'error-message'}>
            {formMessage.text}
          </div>
        )}
      </div>

      <div className="list-section">
        <h2>Список Записей</h2>
        <button onClick={fetchEntries} disabled={loading}>
          {loading ? 'Обновление...' : 'Обновить список'}
        </button>
        {listMessage && <div className="error-message">{listMessage}</div>}
        <table>
          <thead>
            <tr>
              <th>Время ухода</th>
              <th>Ушел на (мин)</th>
              <th>Ожидаемое время возвращения</th>
              <th>Время прихода</th>
              <th>Опоздание (мин)</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {loading && entries.length === 0 ? (
              <tr><td colSpan="6">Загрузка...</td></tr>
            ) : !loading && entries.length === 0 ? (
              <tr><td colSpan="6">Записей пока нет.</td></tr>
            ) : (
              entries.map(entry => {
                const expectedReturnISO = calculateExpectedReturn(entry.departureTime, entry.estimatedDuration);
                const isUpdating = updatingId === entry.id;
                return (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.departureTime)}</td>
                    <td>{entry.estimatedDuration}</td>
                    <td>{formatDateTime(expectedReturnISO)}</td>
                    <td>{formatDateTime(entry.returnTime)}</td>
                    <td>{entry.lateBy !== null ? entry.lateBy : '-'}</td>
                    <td>
                      {!entry.returnTime ? (
                        <button
                          className="return-button"
                          onClick={() => handleReturn(entry.id)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? 'Обновление...' : 'Пришел'}
                        </button>
                      ) : (
                        'Вернулся'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
