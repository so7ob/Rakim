/** Applied when reading an index, so delayed reindex jobs cannot expose disabled records. */
export const PUBLIC_INDEX_RECORD = `
 (sd.article_id IS NULL OR EXISTS (SELECT 1 FROM articles visible_a WHERE visible_a.id=sd.article_id AND visible_a.is_active=TRUE AND visible_a.deleted_at IS NULL))
 AND (sd.entity_type<>'AMENDMENT' OR EXISTS (SELECT 1 FROM amendments visible_am WHERE visible_am.id=sd.entity_id AND visible_am.is_active=TRUE AND visible_am.deleted_at IS NULL))
 AND (sd.entity_type<>'RELATION' OR EXISTS (SELECT 1 FROM legal_relations visible_lr WHERE visible_lr.id=sd.entity_id AND visible_lr.is_active=TRUE AND visible_lr.deleted_at IS NULL))
 AND (sd.entity_type<>'ANNEX_PAGE' OR EXISTS (SELECT 1 FROM annex_files visible_af JOIN annex_versions visible_av ON visible_av.id=visible_af.annex_version_id JOIN annexes visible_ax ON visible_ax.id=visible_av.annex_id WHERE visible_af.id=sd.entity_id AND visible_ax.is_active=TRUE AND visible_ax.deleted_at IS NULL))`;
