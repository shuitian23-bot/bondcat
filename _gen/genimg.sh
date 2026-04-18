#!/bin/bash
# usage: genimg.sh "<prompt>" <output_path>
PROMPT="$1"
OUT="$2"
KEY="sk-3f53104ba295403890bab6b9fee8e773"

R=$(curl -sS -X POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "X-DashScope-Async: enable" \
  -d "{\"model\":\"wanx2.1-t2i-turbo\",\"input\":{\"prompt\":\"$PROMPT\"},\"parameters\":{\"size\":\"512*512\",\"n\":1}}")
TASK=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)[\"output\"][\"task_id\"])")
echo "task=$TASK"
for i in $(seq 1 20); do
  sleep 5
  S=$(curl -sS https://dashscope.aliyuncs.com/api/v1/tasks/$TASK -H "Authorization: Bearer $KEY")
  ST=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin)[\"output\"][\"task_status\"])")
  echo "  [$i] $ST"
  if [ "$ST" = "SUCCEEDED" ]; then
    URL=$(echo "$S" | python3 -c "import sys,json; print(json.load(sys.stdin)[\"output\"][\"results\"][0][\"url\"])")
    curl -sS "$URL" -o "$OUT"
    echo "saved -> $OUT"
    exit 0
  fi
  if [ "$ST" = "FAILED" ]; then echo "$S"; exit 1; fi
done
echo "timeout"; exit 1
