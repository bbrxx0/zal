# Realtime Multi-Client Message Board

System tablicy ogłoszeń z komunikacją w czasie rzeczywistym, wykorzystujący hybrydowy model komunikacji (REST API + WebSockets).

## Uruchomienie

```bash
docker-compose up --build
```

Dostęp do aplikacji:
- **Web Client**: http://localhost:8080
- **CLI Client**: `docker exec -it client-cli python client.py`
- **Server API**: http://localhost:3000

## Architektura Systemu

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTS (różne technologie)               │
│                                                              │
│  ┌──────────────────┐              ┌────────────────────┐  │
│  │  Web Client      │              │   CLI Client       │  │
│  │  (JavaScript)    │              │   (Python)         │  │
│  │  - HTML5         │              │   - requests       │  │
│  │  - Socket.IO     │              │   - python-socketio│  │
│  └──────────────────┘              └────────────────────┘  │
│         │                                     │              │
│         │ HTTP/JSON (REST)                   │              │
│         │ WebSocket (Socket.IO)              │              │
│         └─────────────┬───────────────────────┘              │
└───────────────────────┼──────────────────────────────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │         SERVER              │
          │        (Node.js)            │
          │                             │
          │  ┌────────────────────┐    │
          │  │   REST API         │    │  ← Synchroniczne CRUD
          │  │   (Express.js)     │    │    (GET/POST/PUT/DELETE)
          │  └────────────────────┘    │
          │                             │
          │  ┌────────────────────┐    │
          │  │   WebSocket        │    │  ← Asynchroniczne powiadomienia
          │  │   (Socket.IO)      │    │    (broadcast w czasie rzeczywistym)
          │  └────────────────────┘    │
          │                             │
          │  ┌────────────────────┐    │
          │  │   JWT Middleware   │    │  ← Autoryzacja
          │  └────────────────────┘    │
          │                             │
          │  ┌────────────────────┐    │
          │  │   In-Memory Store  │    │  ← Optymalizacja wydajności
          │  │   (Map + Array)    │    │    O(1) lookup
          │  └────────────────────┘    │
          └─────────────────────────────┘
```

## Hybrydowy Model Komunikacji

### Dlaczego REST + WebSockets?

Projekt świadomie łączy **synchroniczną** i **asynchroniczną** komunikację, aby wykorzystać mocne strony obu podejść:

#### 1. REST API (Synchroniczny) - dla operacji CRUD
**Dlaczego REST?**
- ✅ **Prostota**: HTTP/JSON jest uniwersalny i łatwy w debugowaniu
- ✅ **Bezstanowość**: Każde żądanie jest niezależne (stateless)
- ✅ **Cachowanie**: Możliwość cache'owania odpowiedzi GET
- ✅ **Standardowe kody błędów**: 200, 201, 400, 401, 404 są powszechnie zrozumiałe
- ✅ **Kompatybilność**: Działa z każdym klientem HTTP (curl, Postman, przeglądarki)

**Implementacja w projekcie:**
```
POST   /login              → Uwierzytelnianie (zwraca JWT token)
GET    /messages           → Pobieranie listy wiadomości (z paginacją)
POST   /messages           → Tworzenie nowej wiadomości
PUT    /messages/:id       → Aktualizacja wiadomości
DELETE /messages/:id       → Usuwanie wiadomości
```

#### 2. WebSockets (Asynchroniczny) - dla powiadomień real-time
**Dlaczego WebSockets (Socket.IO)?**
- ✅ **Bidirectional**: Serwer może wysyłać dane do klienta bez zapytania
- ✅ **Low latency**: Brak overhead HTTP request/response dla każdej wiadomości
- ✅ **Broadcast**: Jeden event może być wysłany do wszystkich połączonych klientów
- ✅ **Persistent connection**: Eliminuje powtarzalne nawiązywanie połączeń
- ✅ **Automatic reconnection**: Socket.IO automatycznie ponawia połączenie

**Implementacja w projekcie:**
```javascript
// Serwer broadcast'uje eventy do wszystkich klientów:
io.emit('new_message', message)     → Nowa wiadomość dodana
io.emit('update_message', message)  → Wiadomość zaktualizowana
io.emit('delete_message', message)  → Wiadomość usunięta
```

### Interakcja Komponentów

**Scenariusz 1: Użytkownik tworzy wiadomość**
```
1. Klient → [POST /messages] → Serwer (REST)
2. Serwer waliduje JWT token
3. Serwer zapisuje wiadomość w pamięci
4. Serwer → [200 OK + JSON] → Klient (odpowiedź synchroniczna)
5. Serwer → [WebSocket: new_message] → Wszyscy klienci (broadcast asynchroniczny)
6. Wszyscy klienci otrzymują powiadomienie i aktualizują UI
```

**Scenariusz 2: Użytkownik otwiera aplikację**
```
1. Klient → [POST /login] → Serwer (pobranie JWT)
2. Klient nawiązuje WebSocket connection
3. Klient → [GET /messages?limit=100] → Serwer (pobranie historii)
4. Klient wyświetla wiadomości i czeka na WebSocket eventy
```

**Scenariusz 3: Aktualizacja wiadomości**
```
1. Klient → [PUT /messages/123] → Serwer (REST)
2. Serwer aktualizuje wiadomość (O(1) dzięki Map)
3. Serwer → [200 OK] → Klient
4. Serwer → [WebSocket: update_message] → Wszyscy klienci
```

## Protokoły i Technologie

### Serwer (Node.js + Express.js)
- **Express.js**: Framework do REST API
- **Socket.IO**: WebSocket server z fallback do long-polling
- **jsonwebtoken**: Generowanie i weryfikacja JWT
- **express-rate-limit**: Ochrona przed DDoS (100 req/15min)

### Web Client (JavaScript + HTML5)
- **Vanilla JavaScript**: Bez frameworków (lekka aplikacja)
- **Socket.IO Client**: Połączenie WebSocket z serwerem
- **Fetch API**: Zapytania REST (POST, GET, PUT, DELETE)
- **LocalStorage**: Przechowywanie JWT token

### CLI Client (Python)
- **requests**: Biblioteka HTTP do REST API
- **python-socketio**: WebSocket client
- **Threading**: Asynchroniczna obsługa input i WebSocket events

## Bezpieczeństwo

### Autoryzacja JWT (JSON Web Token)
```
1. Klient: POST /login {username: "user"} → Serwer
2. Serwer: generuje JWT token i zwraca klientowi
3. Klient: zapisuje token i dołącza do każdego żądania
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
4. Serwer: middleware weryfikuje token przed dostępem do zasobów
```

### Obsługa Błędów
- **401 Unauthorized**: Brak tokena lub token wygasł
- **403 Forbidden**: Token nieprawidłowy
- **404 Not Found**: Zasób nie istnieje
- **400 Bad Request**: Błędne dane (np. za długi tekst >10000 znaków)
- **429 Too Many Requests**: Przekroczono rate limit

## Optymalizacje Wydajności

### 1. Struktura Danych O(1)
```javascript
// Zamiast Array (O(n) lookup):
messagesArray.find(m => m.id === id)  // Wolne dla dużych danych

// Używamy Map (O(1) lookup):
messagesMap.get(id)  // Szybkie niezależnie od rozmiaru
```

### 2. Paginacja
```
GET /messages?limit=100&offset=0
→ Zwraca tylko 100 wiadomości zamiast wszystkich
→ Zmniejsza transfer sieciowy i obciążenie pamięci
```

### 3. Rate Limiting
```javascript
// Maksymalnie 100 zapytań na 15 minut na IP
limiter: {
  windowMs: 15 * 60 * 1000,
  max: 100
}
```

### 4. Bounded Memory
```javascript
MAX_MESSAGES = 10000  // Limit wiadomości w pamięci
→ Automatyczne usuwanie najstarszych (FIFO)
→ Zapobiega wyciekowi pamięci
```

### 5. DOM Optimization (Web Client)
```javascript
// Batch updates z DocumentFragment
// Limit DOM elements: MAX_DOM_MESSAGES = 1000
// Deduplication: Set<messageId>
```

## Uruchomienie Krok Po Kroku

### 1. Uruchomienie z Docker Compose (zalecane)
```bash
# Zbuduj i uruchom wszystkie kontenery
docker-compose up --build

# Web client dostępny pod: http://localhost:8080
# Server API dostępny pod: http://localhost:3000
```

### 2. Testowanie CLI Client
```bash
# W nowym terminalu, połącz się z kontenerem
docker exec -it client-cli python client.py

# Postępuj zgodnie z instrukcjami:
# 1. Wprowadź nazwę użytkownika
# 2. Wybierz polecenia: list, send, quit
```

### 3. Testowanie z curl
```bash
# Zaloguj się i otrzymaj token
TOKEN=$(curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser"}' | jq -r .token)

# Pobierz wiadomości
curl http://localhost:3000/messages \
  -H "Authorization: Bearer $TOKEN"

# Utwórz nową wiadomość
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"text":"Hello from curl!"}'
```

## Różne Technologie

Projekt spełnia wymaganie **różnorodności technologicznej**:
- **Serwer**: Node.js + Express.js (JavaScript)
- **Web Client**: Vanilla JavaScript (HTML5)
- **CLI Client**: Python 3

Każdy klient używa innego języka/ekosystemu, demonstrując uniwersalność protokołów HTTP/WebSocket.

## Konteneryzacja

Wszystkie komponenty są skonteneryzowane:
```yaml
services:
  server:      # Node.js server (port 3000)
  client-web:  # Nginx serving HTML/JS (port 8080)
  client-cli:  # Python CLI (interactive)
```

Uruchomienie jednym poleceniem: `docker-compose up --build`

