FROM python:3.10-slim

WORKDIR /app

# Copy python scripts and tests
COPY crawl.py test_crawl.py ./

# Run the test suite by default
CMD ["python", "test_crawl.py"]
