@echo off
:: Firestore 自動バックアップ（タスクスケジューラ用）
:: 毎週実行で c:\py\kakeibo-app\backups\ に保存

cd /d "c:\py\kakeibo-app"
node scripts\backup_firestore.cjs --quiet

:: 30日以上前のバックアップを自動削除（ディスク節約）
forfiles /p "c:\py\kakeibo-app\backups" /m "backup_*.json" /d -30 /c "cmd /c del @path" 2>nul

exit /b 0
