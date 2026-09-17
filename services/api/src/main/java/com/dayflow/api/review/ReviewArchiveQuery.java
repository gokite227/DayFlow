package com.dayflow.api.review;

import com.dayflow.api.review.ReviewDtos.ReviewArchiveEntry;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * The Review archive list as one SQL query per page: KPT counts, the number of linked Goals and a preview
 * line are aggregated in the database, so a page of cards never loads items or Goals review by review
 * (no N+1). Every condition is scoped to the owner, including the Goal title search (AUTH-003).
 */
@Repository
public class ReviewArchiveQuery {

    private static final String SELECT = """
            select r.id, r.type, r.period_start, r.period_end, r.rating, r.completed, r.updated_at,
                   count(i.id) filter (where i.kind = 'KEEP') as keep_count,
                   count(i.id) filter (where i.kind = 'PROBLEM') as problem_count,
                   count(i.id) filter (where i.kind = 'TRY') as try_count,
                   (select count(distinct linked.goal_id)
                      from (select li.goal_id from review_items li where li.review_id = r.id
                            union all
                            select li.target_goal_id from review_items li where li.review_id = r.id) linked
                   ) as linked_goal_count,
                   (select pi.content from review_items pi where pi.review_id = r.id order by pi.position limit 1)
                       as preview
              from reviews r
              left join review_items i on i.review_id = r.id
             where r.user_id = :userId
            """;

    /**
     * A review matches when one of its KPT lines, or the title of a Goal one of its lines links to (source or
     * next Goal), contains the text. EXISTS keeps one row per review however many lines match.
     */
    private static final String SEARCH = """
               and (exists (select 1 from review_items si
                             where si.review_id = r.id and lower(si.content) like :pattern escape '\\')
                    or exists (select 1 from review_items gi
                                 join goals g on g.id = gi.goal_id or g.id = gi.target_goal_id
                                where gi.review_id = r.id and g.user_id = :userId
                                  and lower(g.title) like :pattern escape '\\'))
            """;

    /** Newest reviewed period first; ties (same start, different type) by the latest edit, then id for stable pages. */
    private static final String ORDER = """
             group by r.id
             order by r.period_start desc, r.updated_at desc, r.id desc
             limit :limit offset :offset
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public ReviewArchiveQuery(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Up to {@code limit} entries after skipping {@code offset}; {@code search} is already trimmed or null. */
    public List<ReviewArchiveEntry> find(UUID userId, ReviewType type, String search, int offset, int limit) {
        StringBuilder sql = new StringBuilder(SELECT);
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("offset", offset)
                .addValue("limit", limit);
        if (type != null) {
            sql.append("   and r.type = :type\n");
            params.addValue("type", type.name());
        }
        if (search != null) {
            sql.append(SEARCH);
            params.addValue("pattern", "%" + escapeLike(search.toLowerCase(Locale.ROOT)) + "%");
        }
        sql.append(ORDER);
        return jdbc.query(sql.toString(), params, ReviewArchiveQuery::toEntry);
    }

    /** The search text is literal: %, _ and \ typed by the user are not wildcards. */
    static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static ReviewArchiveEntry toEntry(ResultSet row, int rowNumber) throws SQLException {
        return new ReviewArchiveEntry(
                row.getObject("id", UUID.class),
                ReviewType.valueOf(row.getString("type")),
                row.getObject("period_start", LocalDate.class),
                row.getObject("period_end", LocalDate.class),
                row.getObject("rating", Integer.class),
                row.getBoolean("completed"),
                row.getString("preview"),
                row.getInt("keep_count"),
                row.getInt("problem_count"),
                row.getInt("try_count"),
                row.getInt("linked_goal_count"),
                row.getObject("updated_at", OffsetDateTime.class).toInstant());
    }
}
