
#!/usr/bin/env bash
parms="$1"
source /home/rajandhamala/Desktop/Webrtc/.deploy.env

echo script started

if [[ "$parms" == "frontend" ]]; then
  echo "pushing frontend only"
  cd "$FRONTEND"
  pnpm run build
  echo "pushing frontend to server"
  echo $FRONTEND_DIST
  rsync -avz --progress "$FRONTEND_DIST" "$REMOTE_USER@$REMOTE_HOST":"$HOST_FRONTEND"
elif [[ "$parms" == "backend" ]]; then
  echo "pushing backend only"
  echo "pushing backend to server"
  cd "$BACKEND"
  rsync -avz --progress "$BACKEND" "$REMOTE_USER@$REMOTE_HOST":"$HOST_BACKEND"
else
  echo "pushing both frontend and backend"
  cd "$FRONTEND"
  pnpm run build
  echo "pushing frontend to server"
  rsync -avz --progress "$FRONTEND" "$REMOTE_USER@$REMOTE_HOST":"$HOST_FRONTEND"
  cd "$BACKEND"
  echo "pushing backend to server"
  rsync -avz --progress "$BACKEND" "$REMOTE_USER@$REMOTE_HOST":"$HOST_BACKEND"
fi
echo "script completed"
