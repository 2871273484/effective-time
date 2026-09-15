CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started` integer NOT NULL,
	`ended` integer,
	`active` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_session` ON `sessions` (`active`) WHERE "sessions"."active" = 1;