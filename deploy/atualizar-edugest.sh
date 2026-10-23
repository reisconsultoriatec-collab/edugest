#!/usr/bin/env bash
# =====================================================================
#  EduGest — atualização do servidor a partir do GitHub
#  Reis Tecnologia
#
#  Uso:  ~/atualizar-edugest.sh
#
#  1. Baixa a versão mais recente do repositório (~/edugest-repo)
#  1b. Aplica as alterações de banco novas (api/sql/migracoes), pedindo a
#      senha do root do MySQL; as já aplicadas ficam em ~/.edugest-migracoes
#  2. Copia a API para ~/edugest-api (preserva .env, chave do Firebase
#     e node_modules) e roda npm install só se o package.json mudou
#  3. Copia o front para /var/www/edugest
#  3b. Pergunta (uma vez) o e-mail do proprietário do sistema e grava
#      PROPRIETARIO_EMAILS no .env — só ele cadastra colégios novos
#  4. Reinicia a API no PM2 e confere o /api/health
# =====================================================================

# Tudo dentro de uma função: o bash lê o script inteiro antes de rodar,
# então o próprio script pode ser atualizado pelo git no meio da execução.
main() {
  set -euo pipefail

  local REPO="$HOME/edugest-repo"
  local API="$HOME/edugest-api"
  local WEB="/var/www/edugest"

  echo "==> Baixando a versão mais recente..."
  cd "$REPO"
  local antes depois
  antes=$(git rev-parse --short HEAD)
  git fetch --quiet origin main
  git reset --quiet --hard origin/main
  depois=$(git rev-parse --short HEAD)

  if [ "$antes" = "$depois" ]; then
    echo "    Já estava na versão mais recente ($depois)."
  else
    echo "    $antes → $depois"
    git --no-pager log --oneline "$antes..$depois" | sed 's/^/    • /'
    # Se o próprio script mudou, roda de novo com a versão nova
    if [ -z "${EDUGEST_REEXEC:-}" ] && ! git diff --quiet "$antes" "$depois" -- deploy/atualizar-edugest.sh; then
      echo "    O script de atualização mudou — reiniciando com a versão nova..."
      EDUGEST_REEXEC=1 exec bash "$REPO/deploy/atualizar-edugest.sh"
    fi
  fi

  echo "==> Verificando alterações no banco..."
  local controle="$HOME/.edugest-migracoes" mig nome aplicou=0
  touch "$controle"
  for mig in "$REPO"/api/sql/migracoes/*.sql; do
    [ -e "$mig" ] || continue
    nome=$(basename "$mig")
    grep -qxF "$nome" "$controle" && continue
    echo "    Aplicando $nome — digite a senha do root do MySQL:"
    sudo docker cp "$mig" mysql:/tmp/migracao.sql
    if sudo docker exec -it mysql sh -c 'mysql -u root -p edugest < /tmp/migracao.sql'; then
      sudo docker exec mysql rm -f /tmp/migracao.sql
      echo "$nome" >> "$controle"
      echo "    ✓ $nome aplicada"
      aplicou=1
    else
      sudo docker exec mysql rm -f /tmp/migracao.sql || true
      echo "!!  Falha ao aplicar $nome. A versão no ar NÃO foi alterada. Rode o script de novo."
      exit 1
    fi
  done
  [ "$aplicou" = 0 ] && echo "    Nenhuma alteração pendente."

  echo "==> Atualizando a API..."
  local precisa_npm=0
  if ! cmp -s "$REPO/api/package.json" "$API/package.json"; then precisa_npm=1; fi
  rsync -a --delete \
    --exclude '.env' \
    --exclude 'firebase-service-account.json' \
    --exclude 'node_modules/' \
    "$REPO/api/" "$API/"
  if [ "$precisa_npm" = 1 ]; then
    echo "    package.json mudou — instalando dependências..."
    (cd "$API" && npm install --omit=dev --no-audit --no-fund)
  fi

  echo "==> Atualizando o front..."
  rsync -a --delete "$REPO/web/" "$WEB/"

  # Proprietário do sistema: o único que cadastra colégios novos.
  # Fica só no .env do servidor; pergunta uma única vez.
  if ! grep -q '^PROPRIETARIO_EMAILS=.' "$API/.env"; then
    echo "==> Proprietário do sistema (o único que cadastra colégios novos)"
    local dono=""
    read -rp "    Digite o e-mail com que você entra no EduGest: " dono || true
    dono=$(printf '%s' "$dono" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
    if [[ "$dono" == *@*.* ]]; then
      sed -i '/^PROPRIETARIO_EMAILS=/d' "$API/.env"
      if [ -n "$(tail -c1 "$API/.env")" ]; then echo >> "$API/.env"; fi
      echo "PROPRIETARIO_EMAILS=$dono" >> "$API/.env"
      echo "    ✓ Gravado no .env: PROPRIETARIO_EMAILS=$dono"
    else
      echo "!!  Nenhum e-mail válido informado. Ninguém conseguirá cadastrar colégios"
      echo "    até você rodar o script de novo (ou preencher PROPRIETARIO_EMAILS em $API/.env)."
    fi
  fi

  echo "==> Reiniciando a API..."
  pm2 restart edugest-api --update-env > /dev/null
  sleep 3

  local saude
  saude=$(curl -s --max-time 10 http://127.0.0.1:3001/api/health || true)
  echo "    $saude"
  if echo "$saude" | grep -q '"status":"ok"'; then
    echo "==> Pronto! EduGest atualizado."
  else
    echo "!!  A API não respondeu como esperado. Veja: pm2 logs edugest-api --lines 30 --nostream"
    exit 1
  fi
}

main "$@"
exit $?
