import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useHousehold } from '../hooks/useHousehold';
import type { Household, Category } from '../types';

const BUILTIN_CATEGORY_IDS = new Set(['cat_0', 'cat_1', 'cat_2', 'cat_3', 'cat_4', 'cat_5', 'cat_6']);

interface Props {
  household: Household;
}

export default function SettingsPage({ household }: Props) {
  const { signOut } = useAuth();
  const { updateCategories, updateMemberName } = useHousehold();
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberNameDraft, setMemberNameDraft] = useState('');

  const [m1, m2] = household.memberOrder;
  const name1 = household.memberNames[m1];
  const name2 = household.memberNames[m2];
  const inviteCode = household.inviteCode || household.id;

  const startEditMember = (uid: string, currentName: string) => {
    setEditingMember(uid);
    setMemberNameDraft(currentName ?? '');
  };

  const saveMemberName = async () => {
    if (!editingMember || !memberNameDraft.trim()) return;
    await updateMemberName(editingMember, memberNameDraft.trim());
    setEditingMember(null);
  };

  const handleUpdateCategory = async (updated: Category) => {
    const total = updated.defaultSplit[0] + updated.defaultSplit[1];
    if (total !== 100) {
      alert('割り勘の比率は合計 100 にしてください。');
      return;
    }

    const original = household.categories.find((c) => c.id === updated.id);
    if (!original) return;

    const normalized = BUILTIN_CATEGORY_IDS.has(updated.id)
      ? { ...updated, name: original.name, emoji: original.emoji }
      : updated;

    const newCats = household.categories.map((c) =>
      c.id === updated.id ? normalized : c,
    );
    await updateCategories(newCats);
    setEditingCat(null);
  };

  const handleAddCategory = async () => {
    const newCat: Category = {
      id: `cat_${Date.now()}`,
      name: '新しいカテゴリ',
      emoji: '📦',
      defaultSplit: [50, 50],
      order: household.categories.length,
    };
    await updateCategories([...household.categories, newCat]);
    setEditingCat(newCat);
  };

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <h1 className="page-title">設定</h1>

      {/* ── 世帯情報 ── */}
      <div className="page-subtitle">世帯</div>
      <div className="card settings-group">
        <div className="settings-item" onClick={() => startEditMember(m1, name1)} style={{ cursor: 'pointer' }}>
          <span className="label">メンバー1</span>
          <span className="value">{name1} ✏️</span>
        </div>
        <div className="settings-item" onClick={() => m2 && startEditMember(m2, name2)} style={{ cursor: m2 ? 'pointer' : 'default' }}>
          <span className="label">メンバー2</span>
          <span className="value">{name2 ?? '未参加'} {m2 ? '✏️' : ''}</span>
        </div>
        <div className="settings-item">
          <span className="label">世帯ID</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="value" style={{ fontFamily: 'monospace', letterSpacing: 1.2 }}>
              {inviteCode}
            </span>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={() => {
                navigator.clipboard.writeText(inviteCode).catch((err) => {
                  console.error('招待コードのコピーに失敗:', err);
                });
              }}
            >
              コピー
            </button>
          </div>
        </div>
      </div>

      {/* ── メンバー名編集モーダル ── */}
      {editingMember && (
        <motion.div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
            padding: 16,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setEditingMember(null)}
        >
          <motion.div
            className="card"
            style={{ width: '100%', maxWidth: 360, padding: 24 }}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>表示名を変更</h3>
            <div className="form-group">
              <input
                className="form-input"
                value={memberNameDraft}
                onChange={(e) => setMemberNameDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveMemberName()}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingMember(null)}>
                キャンセル
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveMemberName}>
                保存
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ── カテゴリ ── */}
      <div className="page-subtitle">カテゴリ・デフォルト割り勘</div>
      <div className="card settings-group">
        {household.categories.map((cat) => (
          <div
            key={cat.id}
            className="settings-item"
            onClick={() => setEditingCat(cat)}
            style={{ cursor: 'pointer' }}
          >
            <span className="label">
              {cat.emoji} {cat.name}
            </span>
            <span className="value">
              {cat.defaultSplit[0]}:{cat.defaultSplit[1]}
            </span>
          </div>
        ))}
        <button
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          onClick={handleAddCategory}
        >
          ＋ カテゴリを追加
        </button>
      </div>

      {/* ── カテゴリ編集モーダル ── */}
      {editingCat && (
        <CategoryEditor
          category={editingCat}
          name1={name1}
          name2={name2}
          onSave={handleUpdateCategory}
          onCancel={() => setEditingCat(null)}
          onDelete={async () => {
            if (BUILTIN_CATEGORY_IDS.has(editingCat.id)) {
              alert('基本カテゴリは削除できません。');
              return;
            }
            const newCats = household.categories.filter(
              (c) => c.id !== editingCat.id,
            );
            await updateCategories(newCats);
            setEditingCat(null);
          }}
        />
      )}

      {/* ── ログアウト ── */}
      <button
        className="btn btn-danger"
        style={{ marginTop: 32 }}
        onClick={signOut}
      >
        ログアウト
      </button>
    </motion.div>
  );
}

/* ── カテゴリ編集 ── */
function CategoryEditor({
  category,
  name1,
  name2,
  onSave,
  onCancel,
  onDelete,
}: {
  category: Category;
  name1: string;
  name2: string;
  onSave: (c: Category) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const isBuiltIn = BUILTIN_CATEGORY_IDS.has(category.id);
  const [name, setName] = useState(category.name);
  const [emoji, setEmoji] = useState(category.emoji);
  const [a, setA] = useState(String(category.defaultSplit[0]));
  const [b, setB] = useState(String(category.defaultSplit[1]));
  const ratioTotal = (parseInt(a, 10) || 0) + (parseInt(b, 10) || 0);

  return (
    <motion.div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 300,
        padding: 16,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onCancel}
    >
      <motion.div
        className="card"
        style={{ width: '100%', maxWidth: 448, marginBottom: 16 }}
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
          カテゴリ編集
        </h3>

        <div className="form-group">
          <label className="form-label">絵文字</label>
          <input
            className="form-input"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            style={{ width: 80, textAlign: 'center', fontSize: 24 }}
            disabled={isBuiltIn}
          />
        </div>

        <div className="form-group">
          <label className="form-label">カテゴリ名</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isBuiltIn}
          />
        </div>

        {isBuiltIn && (
          <div className="card" style={{ marginBottom: 12, padding: 12, fontSize: 12, opacity: 0.74 }}>
            基本カテゴリは名前と絵文字を固定しています。割合だけ変更できます。
          </div>
        )}

        <div className="form-group">
          <label className="form-label">デフォルト割り勘</label>
          <div className="custom-ratio-input">
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{name1}</span>
            <input
              value={a}
              onChange={(e) => setA(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
            <span className="colon">:</span>
            <input
              value={b}
              onChange={(e) => setB(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{name2}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: ratioTotal === 100 ? 'var(--color-text-secondary)' : '#FF3B30' }}>
            合計: {ratioTotal}%
          </div>
        </div>

        <button
          className="btn btn-primary"
          disabled={ratioTotal !== 100 || !name.trim() || !emoji.trim()}
          onClick={() =>
            onSave({
              ...category,
              name,
              emoji,
              defaultSplit: [parseInt(a, 10) || 0, parseInt(b, 10) || 0],
            })
          }
        >
          保存
        </button>
        {!isBuiltIn && (
          <button className="btn btn-secondary" onClick={onDelete}>
            削除
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
