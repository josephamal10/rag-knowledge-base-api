// database services
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'rules' })
export class RuleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  region: string;

  // Course identity (= Upstash namespace). Unified with region on ingest (region = courseId).
  @Column({ type: 'text', default: '' })
  courseId: string;

  // Fixed policy taxonomy (separate from region / corpus label).
  @Column({ type: 'text', default: 'golf-rules' })
  category: string;

  @Column({ type: 'text', nullable: true })
  ruleNumber: string | null;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  content: string;

  // Where this chunk came from: document upload, pasted text, or URL.
  @Column({ type: 'text', default: 'document' })
  sourceType: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}

