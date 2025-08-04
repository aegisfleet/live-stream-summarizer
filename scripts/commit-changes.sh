#!/bin/bash

# コミット処理を共通化するスクリプト
# 使用方法: ./scripts/commit-changes.sh "コミットメッセージ" [追加するファイルパターン]

set -euo pipefail

# グローバル変数
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# エラーハンドリング
err() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')]: $*" >&2
}

# ログ出力
log() {
  echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')]: $*"
}

# 使用方法を表示
show_usage() {
  cat << EOF
使用方法: $SCRIPT_NAME <コミットメッセージ> [追加するファイルパターン...]

引数:
  コミットメッセージ    コミットに使用するメッセージ
  ファイルパターン      追加するファイルのパターン（オプション）

例:
  $SCRIPT_NAME 'chore: Update stream summaries'
  $SCRIPT_NAME 'chore: cleanup old summaries' 'src/data/summaries.json'

EOF
}

# 引数の検証
validate_args() {
  if [[ $# -lt 1 ]]; then
    err "エラー: コミットメッセージが指定されていません"
    show_usage
    exit 1
  fi

  if [[ -z "${1:-}" ]]; then
    err "エラー: コミットメッセージが空です"
    exit 1
  fi
}

# Git設定
setup_git_config() {
  log "Git設定を初期化中..."
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
}

# リモートとの同期
sync_with_remote() {
  log "リモートリポジトリとの同期中..."
  
  # 現在の変更を一時保存
  git stash push -m "Temporary stash before pull" || log "保存する変更がありません"

  # リモートの最新情報を取得
  git fetch origin

  # 現在のブランチ名を取得
  local current_branch
  current_branch=$(git branch --show-current)

  # リモートブランチとの差分を確認
  if git rev-list HEAD...origin/"$current_branch" --count | grep -q "^[1-9]"; then
    log "リモートに新しいコミットがあります。リモートに合わせてリセットします"
    git reset --hard "origin/$current_branch"
  fi

  # 一時保存した変更を復元
  git stash pop || log "復元する変更がありません"
}

# ファイルの追加
add_files() {
  log "ファイルをステージングエリアに追加中..."
  
  if [[ $# -eq 0 ]]; then
    # 引数が指定されていない場合は全ての変更を追加
    git add --all
  else
    # 指定されたファイルパターンを追加
    for pattern in "$@"; do
      if [[ -e "$pattern" ]]; then
        git add "$pattern"
        log "追加: $pattern"
      else
        log "警告: ファイルが見つかりません: $pattern"
      fi
    done
  fi
}

# コミットとプッシュ
commit_and_push() {
  local commit_message="$1"
  
  # 変更があるかチェック
  if git diff --cached --quiet; then
    log "コミットする変更がありません"
    return 0
  fi

  # コミットとプッシュ
  log "変更をコミット中..."
  git commit -m "$commit_message"
  
  log "リモートリポジトリにプッシュ中..."
  git push
  
  log "変更のコミットとプッシュが完了しました"
}

# メイン関数
main() {
  log "コミット処理を開始します"
  
  # 引数の検証
  validate_args "$@"
  
  # コミットメッセージを取得
  local commit_message="$1"
  shift
  
  # Git設定
  setup_git_config
  
  # リモートとの同期
  sync_with_remote
  
  # ファイルの追加
  add_files "$@"
  
  # コミットとプッシュ
  commit_and_push "$commit_message"
  
  log "コミット処理が完了しました"
}

# スクリプトが直接実行された場合のみmain関数を呼び出し
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
