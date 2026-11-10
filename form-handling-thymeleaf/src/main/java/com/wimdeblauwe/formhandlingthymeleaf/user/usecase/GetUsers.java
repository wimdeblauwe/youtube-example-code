package com.wimdeblauwe.formhandlingthymeleaf.user.usecase;

import com.wimdeblauwe.formhandlingthymeleaf.user.User;
import com.wimdeblauwe.formhandlingthymeleaf.user.repository.UserRepository;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class GetUsers {

    private final UserRepository userRepository;

    public GetUsers(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public List<User> execute() {
        return userRepository.findAll();
    }
}
