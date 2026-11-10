-- Recalculate only the generated copy passed by the corpus runner.
-- Never change application calculation/alert settings or close another workbook.
on run arguments
  set workbookPath to item 1 of arguments
  tell application "Microsoft Excel"
    -- Bad arities/names can be rejected at formula entry rather than produce a
    -- cell error. Detect that before import, which would otherwise request a
    -- repair. This scratch workbook never contains or changes user data.
    if (count of arguments) > 1 then
      set validationWorkbook to make new workbook
      try
        set name of worksheet 1 of validationWorkbook to "Inputs"
        set validationSheet to make new worksheet at end of validationWorkbook
        set name of validationSheet to "Results"
        set enteredFormula to ""
        try
          set formula of range "A1" of validationSheet to "=" & item 2 of arguments
          set enteredFormula to formula of range "A1" of validationSheet as text
        end try
        close validationWorkbook saving no
        if enteredFormula is "" then return "ENTRY_REJECTED"
      on error messageText number errorNumber
        close validationWorkbook saving no
        error messageText number errorNumber
      end try
    end if
    set oracleWorkbook to missing value
    try
      set oracleWorkbook to open workbook workbook file name workbookPath update links do not update links
      if oracleWorkbook is missing value then error "Excel declined the generated workbook; import must succeed without repair."
      calculate worksheet "Results" of oracleWorkbook
      save oracleWorkbook
      set nativeOutput to version as text
      -- New Excel errors can use a legacy #VALUE! cache plus rich metadata.
      -- Read requested error labels while this disposable workbook is open.
      repeat with itemIndex from 3 to count of arguments
        set cellAddress to item itemIndex of arguments
        set displayedError to string value of range cellAddress of worksheet "Results" of oracleWorkbook
        set nativeOutput to nativeOutput & linefeed & cellAddress & (character id 9) & displayedError
      end repeat
      close oracleWorkbook saving no
      return nativeOutput
    on error messageText number errorNumber
      if oracleWorkbook is not missing value then close oracleWorkbook saving no
      error messageText number errorNumber
    end try
  end tell
end run
