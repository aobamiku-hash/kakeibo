import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useHousehold } from '../hooks/useHousehold';
import type { Household, Category } from '../types';

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
    const newCats = household.categories.map((c) =>
      c.id === updated.id ? updated : c,
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
          <span className="label">招待コード</span>
          <span className="value" style={{ fontFamily: 'monospace', letterSpacing: 2 }}>
            {household.inviteCode}
          </span>
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
  const [name, setName] = useState(category.name);
  const [emoji, setEmoji] = useState(category.emoji);
  const [a, setA] = useState(String(category.defaultSplit[0]));
  const [b, setB] = useState(String(category.defaultSplit[1]));

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
          />
        </div>

        <div className="form-group">
          <label className="form-label">カテゴリ名</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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
        </div>

        <button
          className="btn btn-primary"
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
        <button className="btn btn-secondary" onClick={onDelete}>
          削除
        </button>
      </motion.div>
    </motion.div>
  );
}
