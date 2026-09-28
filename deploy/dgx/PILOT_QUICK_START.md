# CoAIr Local — device trial

1. Turn on the device and connect it to the same network as your computer.
2. Allow several minutes for the local model and services to start. Open
   **http://spark-9631.local:8080** in your browser.
   On the currently configured network, **http://192.168.1.57:8080** is the fallback.
   The IP address can change on a different network. The device also has a
   **CoAIr Local** application shortcut.
3. Sign in using the username and password supplied separately with the device.
4. Choose **Chatbot**, then select **Edinburgh Test** from the project selector.
5. Ask: **“What does MUDFA refer to in this project? Identify the parties and cite the documents.”**
   Open the cited document to inspect the original page and extracted text.
6. Open **Document import and OCR review** to upload your own PDF or document.
   Wait for processing to finish. Review the extracted text and metadata; save
   corrections and wait for reindexing before asking questions about them.
7. Open **Chronology** to read a completed report, download its Word file, or
   generate a new report from a topic and selected project documents.
   A completed **MUDFA utility diversion delays** report is available in Edinburgh
   Test. Its partial-coverage notice means it is not an exhaustive archive review.
   Large reports can take hours and run in the background; **Generating** does not mean complete.

The interface and generated answers are in English. Documents, PostgreSQL,
Qdrant vectors, OCR, embeddings and inference are hosted on the device. Internet
access is not required by the application or its model services after setup.
Remote support uses Tailscale; company-LAN access does not require Tailscale on
client computers. The current pilot uses HTTP on a trusted local network.

**Trial data:** `Edinburgh Test` is the imported archive. `Device acceptance —
September 2026` contains explicitly fictional test data and should not be used
as evidence about the Edinburgh project. Two encrypted spreadsheets were excluded
from the acceptance scope at the owner's request.

## Operator recovery

Run from `/home/coair/coair-local` on the device:

```sh
docker start coair-llm-vllm-1
docker compose -f deploy/dgx/compose.yaml up -d --no-build --wait --wait-timeout 300
bash deploy/dgx/check.sh
```

Do not run setup or bootstrap again and do not delete Docker volumes. Existing
accounts, original documents, reviews, chats and reports are stored persistently.
The current image archive packages application services and embedding weights;
it does not package the separately installed Qwen model runtime/weights or
customer data. Use the configured device for this trial.
