Feature: Route segy integration test

  Background: Created necessary segy configuration
    Given create config
    And create subproject
    And create dataset with id integration_test_dataset.sgy
    And upload dataset with id integration_test_dataset.sgy

  Scenario: Revision endpoint response
    When revision endpoint is called
    Then revision response should have value 0

  Scenario: Is3D endpoint response
    When is3D endpoint is called
    Then is3D response should have value True

  Scenario: TraceHeaderFieldCount endpoint response
    When traceHeaderFieldCount endpoint is called
    Then traceHeaderFieldCount response should have value 73

  Scenario: TextualHeader endpoint response
    When textualHeader endpoint is called
    Then textualHeader response should have value integration_test_segy_textualHeader_response.json

  Scenario: ExtendedTextualHeaders endpoint response
    When extendedTextualHeaders endpoint is called
    Then extendedTextualHeaders response should have value integration_test_segy_extendedTextualHeaders_response.json

  Scenario: BinaryHeader endpoint response
    When binaryHeader endpoint is called
    Then binaryHeader response should have value integration_test_segy_binaryHeader_response.json

  Scenario: RawTraceHeaders endpoint response
    When rawTraceHeaders endpoint is called
    Then rawTraceHeaders response should have value integration_test_segy_rawTraceHeaders_response.json

  Scenario: ScaledTraceHeaders endpoint response
    When scaledTraceHeaders endpoint is called
    Then scaledTraceHeaders response should have value integration_test_segy_scaledTraceHeaders_response.json
