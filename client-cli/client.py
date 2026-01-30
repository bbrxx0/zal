import requests
import socketio
import sys

API = 'http://server:3000'
sio = socketio.Client()
token = ''
REQUEST_TIMEOUT = 10  # seconds

@sio.event
def connect():
    print('Connected to server via WebSocket')

@sio.event
def new_message(msg):
    print(f'NEW: {msg["text"]}')

@sio.event
def update_message(msg):
    print(f'UPDATE: {msg["text"]}')

@sio.event
def delete_message(msg):
    print(f'DELETE: {msg["text"]}')

def login():
    global token
    username = input("Enter username: ")
    if not username:
        print("Username cannot be empty")
        sys.exit(1)
    
    try:
        res = requests.post(
            f'{API}/login', 
            json={'username': username},
            timeout=REQUEST_TIMEOUT
        )
        res.raise_for_status()
        data = res.json()
        token = data.get('token')
        if not token:
            print("Error: No token received from server")
            sys.exit(1)
        print("Login successful!")
    except requests.exceptions.Timeout:
        print("Error: Request timeout")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Cannot connect to server")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"Error during login: {e}")
        sys.exit(1)

def send():
    text = input("Message: ")
    if not text:
        print("Message cannot be empty")
        return
    
    if len(text) > 10000:
        print("Error: Message too long (max 10000 characters)")
        return
    
    try:
        res = requests.post(
            f'{API}/messages', 
            json={'text': text}, 
            headers={'Authorization': 'Bearer ' + token},
            timeout=REQUEST_TIMEOUT
        )
        res.raise_for_status()
        data = res.json()
        print("Sent:", data.get('text', 'N/A'))
    except requests.exceptions.Timeout:
        print("Error: Request timeout")
    except requests.exceptions.ConnectionError:
        print("Error: Cannot connect to server")
    except requests.exceptions.HTTPError as e:
        print(f"Error: {e}")
        try:
            error_data = e.response.json()
            print(f"Server error: {error_data.get('error', 'Unknown error')}")
        except Exception:
            pass
    except requests.exceptions.RequestException as e:
        print(f"Error sending message: {e}")

def list_messages():
    try:
        res = requests.get(
            f'{API}/messages?limit=100&offset=0', 
            headers={'Authorization': 'Bearer ' + token},
            timeout=REQUEST_TIMEOUT
        )
        res.raise_for_status()
        data = res.json()
        
        # Handle both old and new API format
        messages = data.get('messages', data) if isinstance(data, dict) else data
        
        if not messages:
            print("No messages found")
            return
            
        for m in messages:
            print(f"{m['id']}: {m['text']}")
    except requests.exceptions.Timeout:
        print("Error: Request timeout")
    except requests.exceptions.ConnectionError:
        print("Error: Cannot connect to server")
    except requests.exceptions.HTTPError as e:
        print(f"Error: {e}")
        try:
            error_data = e.response.json()
            print(f"Server error: {error_data.get('error', 'Unknown error')}")
        except Exception:
            pass
    except requests.exceptions.RequestException as e:
        print(f"Error listing messages: {e}")

if __name__ == '__main__':
    login()
    
    try:
        sio.connect('http://server:3000', wait_timeout=REQUEST_TIMEOUT)
    except Exception as e:
        print(f"Warning: Could not connect to WebSocket: {e}")
        print("Continuing without real-time updates...")
    
    try:
        while True:
            cmd = input("Command (list/send/quit): ")
            if cmd == 'list':
                list_messages()
            elif cmd == 'send':
                send()
            elif cmd == 'quit':
                break
            else:
                print("Unknown command. Use 'list', 'send', or 'quit'")
    except KeyboardInterrupt:
        print("\nExiting...")
    finally:
        if sio.connected:
            sio.disconnect()

