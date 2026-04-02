-- Store allergen names per menu item (e.g. {"Eggs","Milk","Gluten"})
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS allergens TEXT[] DEFAULT '{}';
