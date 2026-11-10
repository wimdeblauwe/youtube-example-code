package com.wimdeblauwe.formhandlingthymeleaf.user.web;

import com.wimdeblauwe.formhandlingthymeleaf.user.usecase.CreateUserParameters;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateUserFormData {
    @NotBlank
    @Size(min = 1, max = 400)
    private String givenName;

    @NotBlank
    @Size(min = 1, max = 400)
    private String familyName;

    public String getGivenName() {
        return givenName;
    }

    public void setGivenName(String givenName) {
        this.givenName = givenName;
    }

    public String getFamilyName() {
        return familyName;
    }

    public void setFamilyName(String familyName) {
        this.familyName = familyName;
    }

    public CreateUserParameters toParameters() {
        return new CreateUserParameters(givenName, familyName);
    }
}
