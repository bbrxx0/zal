FROM python:3.12-alpine
WORKDIR /app
COPY client.py .
RUN pip install requests "python-socketio[client]"
CMD ["python", "client.py"]
