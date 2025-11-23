# Requirements Document

## Introduction

This feature provides a data cleanup tool for standardizing place names in expense records. Users often enter the same location with slight variations (e.g., "Walmart", "walmart", "Wal-Mart", "WalMart"), which can lead to inconsistent reporting and analysis. This tool will identify similar place names and allow users to standardize them to a consistent canonical form.

## Glossary

- **Place Name**: The value stored in the "place" field of an expense record, representing where the expense occurred
- **Canonical Name**: The standardized, preferred version of a place name that variations will be updated to
- **Variation**: A different spelling or formatting of the same place name
- **Similarity Group**: A collection of place name variations that are likely referring to the same location
- **Fuzzy Matching**: An algorithm that identifies strings that are similar but not identical
- **Bulk Update**: An operation that updates multiple expense records simultaneously

## Requirements

### Requirement 1

**User Story:** As a user, I want to access place name standardization tools from the Settings modal, so that I can clean up inconsistent place names in my expense data.

#### Acceptance Criteria

1. WHEN a user opens the Settings modal THEN the system SHALL display a new "Misc" section
2. WHEN a user views the Misc section THEN the system SHALL display a "Standardize Place Names" option
3. WHEN a user clicks the "Standardize Place Names" option THEN the system SHALL open the place name standardization interface
4. THE system SHALL maintain the existing Settings modal structure and styling
5. THE system SHALL ensure the Misc section is clearly separated from other settings sections

### Requirement 2

**User Story:** As a user, I want the system to analyze my expense data and identify similar place names, so that I can see which entries need standardization.

#### Acceptance Criteria

1. WHEN the place name standardization interface loads THEN the system SHALL analyze all expense records in the database
2. WHEN analyzing place names THEN the system SHALL group similar variations together using fuzzy matching
3. WHEN grouping place names THEN the system SHALL use case-insensitive comparison
4. WHEN grouping place names THEN the system SHALL ignore leading and trailing whitespace
5. WHEN grouping place names THEN the system SHALL detect common variations including punctuation differences, spacing differences, and minor spelling variations
6. THE system SHALL calculate the number of expenses associated with each place name variation
7. THE system SHALL present similarity groups ordered by total expense count (most common first)

### Requirement 3

**User Story:** As a user, I want to see groups of similar place names with their expense counts, so that I can identify which variations exist and how frequently they're used.

#### Acceptance Criteria

1. WHEN displaying similarity groups THEN the system SHALL show each group in a collapsible card or panel
2. WHEN displaying a similarity group THEN the system SHALL show all variations found within that group
3. WHEN displaying each variation THEN the system SHALL show the exact place name text and the number of expenses using that variation
4. WHEN displaying variations THEN the system SHALL highlight the most frequently used variation as a suggested canonical name
5. THE system SHALL display a summary count showing total number of similarity groups found
6. THE system SHALL allow users to expand and collapse individual similarity groups
7. THE system SHALL display a message when no similar place names are detected

### Requirement 4

**User Story:** As a user, I want to select a canonical name for each similarity group and update all variations to match, so that my expense data becomes consistent.

#### Acceptance Criteria

1. WHEN viewing a similarity group THEN the system SHALL allow the user to select one variation as the canonical name
2. WHEN viewing a similarity group THEN the system SHALL provide an option to enter a custom canonical name
3. WHEN a user selects a canonical name THEN the system SHALL highlight which variations will be updated
4. WHEN a user confirms the standardization THEN the system SHALL display a preview showing the number of expenses that will be affected
5. WHEN a user confirms the standardization THEN the system SHALL require explicit confirmation before making changes
6. WHEN the system updates place names THEN the system SHALL update all matching expense records in a single transaction
7. WHEN the update completes THEN the system SHALL display a success message with the number of records updated
8. WHEN the update fails THEN the system SHALL display an error message and SHALL NOT modify any records

### Requirement 5

**User Story:** As a user, I want to see the most common place names in my expense data, so that I can identify potential inconsistencies and understand my spending patterns.

#### Acceptance Criteria

1. WHEN the place name standardization interface loads THEN the system SHALL display a list of the top place names by expense count
2. WHEN displaying top place names THEN the system SHALL show at least the top 20 most common places
3. WHEN displaying each place name THEN the system SHALL show the name and the total number of expenses
4. THE system SHALL allow users to sort the list by name alphabetically or by expense count
5. THE system SHALL provide a search or filter function to find specific place names in the list

### Requirement 6

**User Story:** As a user, I want the standardization process to be safe and reversible, so that I don't accidentally corrupt my expense data.

#### Acceptance Criteria

1. WHEN a user initiates a bulk update THEN the system SHALL display a confirmation dialog showing exactly what will change
2. WHEN displaying the confirmation dialog THEN the system SHALL show the old value, new value, and number of affected records
3. WHEN a user confirms the update THEN the system SHALL create a backup of affected records before making changes
4. THE system SHALL provide clear cancel options at every step before changes are committed
5. THE system SHALL log all standardization operations for audit purposes
6. WHEN an error occurs during update THEN the system SHALL roll back all changes and restore the original state

### Requirement 7

**User Story:** As a user, I want to manually merge specific place name variations, so that I can handle cases the automatic detection misses.

#### Acceptance Criteria

1. WHEN viewing the place name list THEN the system SHALL allow users to manually select multiple place names
2. WHEN multiple place names are selected THEN the system SHALL provide an option to merge them
3. WHEN merging place names THEN the system SHALL allow the user to specify the canonical name
4. WHEN merging place names THEN the system SHALL follow the same confirmation and update process as automatic grouping
5. THE system SHALL allow users to create custom similarity groups that override automatic detection
