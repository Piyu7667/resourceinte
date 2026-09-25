# RE:SOURCE deployment

## Windows
Double-click `START_RESOURCE.bat`. It installs dependencies with npm's legacy peer-dependency mode and starts the original React/Vite interface.

## GitHub
Create an empty repository and upload the project contents (not node_modules). Do not upload `.env` secrets.

## Render
Create a Web Service connected to the repository. Build: `npm install --legacy-peer-deps && npm run build`. Start: `npm start`. Set `NODE_ENV=production`. Use the HTTPS URL Render provides in the SIH PPT.

## Enterprise inputs
Use the templates in `templates/` for ERP, MES and NMS exports. The Enterprise Data Hub maps common aliases into the existing resource/demand model.
