FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY campsite_checker.py .
ENV CONFIG_PATH=/data/config.toml STATE_PATH=/data/state.json PYTHONUNBUFFERED=1
VOLUME /data
CMD ["python", "campsite_checker.py"]
