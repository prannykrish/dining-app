-- Which meals do the 69 stations actually belong to?
SELECT s.meal_id, m.date, m.meal_type, dh.name as hall, COUNT(s.id) as stations
FROM stations s
JOIN meals m ON m.id = s.meal_id
JOIN dining_halls dh ON dh.id = m.dining_hall_id
GROUP BY s.meal_id, m.date, m.meal_type, dh.name
ORDER BY m.date, dh.name;
