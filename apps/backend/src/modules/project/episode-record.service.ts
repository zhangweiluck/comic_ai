import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export interface EpisodeRecord {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  sequence: number;
  status: "draft" | "ready" | "archived";
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface EpisodeRow {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  sequence: number | string;
  status: EpisodeRecord["status"];
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function replaceEpisodesForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    createdByUserId: string;
    episodes: Array<{
      id?: string;
      title: string;
      sequence: number;
      status?: EpisodeRecord["status"];
    }>;
    now: Date;
  },
): Promise<EpisodeRecord[]> {
  await db.query(
    `
      DELETE FROM episodes
      WHERE organization_id = $1
        AND project_id = $2
    `,
    [input.organizationId, input.projectId],
  );

  for (const episode of input.episodes) {
    await insertEpisode(db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      id: episode.id ?? randomUUID(),
      title: episode.title,
      sequence: episode.sequence,
      status: episode.status ?? "draft",
      now: input.now,
    });
  }

  return listEpisodesForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
}

export async function listEpisodesForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
  },
): Promise<EpisodeRecord[]> {
  const result = await db.query<EpisodeRow>(
    `
      SELECT *
      FROM episodes
      WHERE organization_id = $1
        AND project_id = $2
      ORDER BY sequence ASC, created_at ASC, id ASC
    `,
    [input.organizationId, input.projectId],
  );

  return result.rows.map(episodeFromRow);
}

export async function createEpisodeForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    title: string;
    createdByUserId: string;
    now: Date;
  },
): Promise<EpisodeRecord> {
  const sequence = await getNextEpisodeSequence(db, input);
  const id = randomUUID();
  await insertEpisode(db, {
    ...input,
    id,
    sequence,
    status: "draft",
  });
  const episodes = await listEpisodesForProject(db, input);
  return episodes.find((episode) => episode.id === id)!;
}

export async function updateEpisodeForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    episodeId: string;
    title?: string | null;
    status?: EpisodeRecord["status"] | null;
    now: Date;
  },
): Promise<EpisodeRecord | null> {
  const row = (
    await db.query<EpisodeRow>(
      `
        UPDATE episodes
        SET title = COALESCE(NULLIF($4, ''), title),
            status = COALESCE($5, status),
            updated_at = $6
        WHERE organization_id = $1
          AND project_id = $2
          AND id = $3
        RETURNING *
      `,
      [
        input.organizationId,
        input.projectId,
        input.episodeId,
        input.title?.trim() ?? null,
        input.status ?? null,
        input.now,
      ],
    )
  ).rows[0];

  return row ? episodeFromRow(row) : null;
}

export async function deleteEpisodeForProject(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    episodeId: string;
  },
): Promise<boolean> {
  await db.query(
    `
      UPDATE shots
      SET episode_id = NULL
      WHERE organization_id = $1
        AND project_id = $2
        AND episode_id = $3
    `,
    [input.organizationId, input.projectId, input.episodeId],
  );
  const result = await db.query<{ id: string }>(
    `
      DELETE FROM episodes
      WHERE organization_id = $1
        AND project_id = $2
        AND id = $3
      RETURNING id
    `,
    [input.organizationId, input.projectId, input.episodeId],
  );

  return Boolean(result.rows[0]);
}

async function insertEpisode(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    id: string;
    title: string;
    sequence: number;
    status: EpisodeRecord["status"];
    createdByUserId: string;
    now: Date;
  },
) {
  await db.query(
    `
      INSERT INTO episodes (
        id,
        organization_id,
        project_id,
        title,
        sequence,
        status,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    `,
    [
      input.id,
      input.organizationId,
      input.projectId,
      input.title.trim() || `剧集 ${input.sequence}`,
      input.sequence,
      input.status,
      input.createdByUserId,
      input.now,
    ],
  );
}

async function getNextEpisodeSequence(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
  },
) {
  const row = (
    await db.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(sequence), 0)::int + 1 AS next_sequence
        FROM episodes
        WHERE organization_id = $1
          AND project_id = $2
      `,
      [input.organizationId, input.projectId],
    )
  ).rows[0];

  return row?.next_sequence ?? 1;
}

function episodeFromRow(row: EpisodeRow): EpisodeRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    title: row.title,
    sequence: Number(row.sequence),
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
