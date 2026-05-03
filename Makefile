.PHONY: neo4j neo4j-stop pipeline api frontend setup test

# --- Infrastructure ---

neo4j:
	docker-compose up -d neo4j
	@echo "Neo4j starting. Browser UI: http://localhost:7474 (neo4j / bioreason123)"

neo4j-stop:
	docker-compose stop neo4j

neo4j-logs:
	docker-compose logs -f neo4j

# --- Data pipeline ---

pipeline-primekg:
	python pipeline/load_primekg.py

pipeline-imppat:
	python pipeline/load_imppat.py

pipeline-all: pipeline-primekg pipeline-imppat

# --- Servers ---

api:
	uvicorn api.reason:app --reload --host 0.0.0.0 --port 8000

frontend:
	npm run dev

# --- Setup ---

setup:
	pip install -r requirements.txt
	npm install

# --- Validation ---

test:
	@echo "=== Health check ==="
	curl -s http://localhost:8000/health | python -m json.tool
	@echo ""
	@echo "=== Graph stats ==="
	curl -s http://localhost:8000/stats | python -m json.tool
	@echo ""
	@echo "=== 1-hop test: Metformin targets ==="
	curl -s -X POST http://localhost:8000/reason \
		-H "Content-Type: application/json" \
		-d '{"question":"What proteins does Metformin target?","max_hops":1}' \
		| python -m json.tool
