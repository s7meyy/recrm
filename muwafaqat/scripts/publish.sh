#!/usr/bin/env sh
# نقل «الموافقات» من مجلدٍ داخل recrm إلى مستودعها المستقل.
#
# أنشئ المستودع فارغًا أولًا (بلا README ولا .gitignore):
#   https://github.com/new  ←  الاسم: muwafaqat
# ثم شغّل هذا من داخل مجلد muwafaqat:
#   sh scripts/publish.sh [owner/repo]

set -eu
REPO="${1:-s7meyy/muwafaqat}"

[ -f core/verify.js ] || { echo "شغّله من داخل مجلد muwafaqat"; exit 1; }
[ -d .git ] && { echo "هذا المجلد مستودعٌ بالفعل"; exit 1; }

node tests/run.js

git init -q
git add .
git commit -q -m "الموافقات: النواة وجسر الشاملة

بوابة التحقّق أولًا لا آخرًا: البيت الذي لا يوجد نصُّه — مطبَّعًا —
داخل وثيقةٍ استُرجعت فعلًا يسقط، ولو كان بيتًا صحيحًا يعرفه الناس."
git branch -M main
git remote add origin "https://github.com/${REPO}"
git push -u origin main

echo ""
echo "تمّ. https://github.com/${REPO}"
