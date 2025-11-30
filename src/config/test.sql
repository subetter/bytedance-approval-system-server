SELECT *
FROM approval_forms
WHERE
    is_deleted = FALSE
    AND applicant_id = 101
LIMIT 10